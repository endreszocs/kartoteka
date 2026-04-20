-- =========================================================================
-- 2026-04-18 — Admin Rendszer pénzügyei: 3 új tábla + RLS + seed
-- =========================================================================
-- CÉL:
--   Az admin oldalon új "Rendszer pénzügyei" modul, amely Endre (rendszer-
--   fejlesztő) számára mutatja:
--     - havi rendszer-költségeket (Supabase, Vercel, Cloudflare R2, AI szerver,
--       monitoring, mobil) tételenként szerkeszthető
--     - árazási sávok tag-szám szerint (kis/közepes/nagy gyülekezet)
--     - gyülekezet-szintű előfizetéseket
--     - havi bevétel / költség / profit aggregációt
--
-- ALAPELV (Endre, 2026-04-18):
--   - Az árazás TAG-SZÁM SZERINT igazodik: kis gyülekezet olcsóbban fizet,
--     nagy gyülekezet többet — a "képesség szerinti elosztás" alapján
--   - A rendszergazda (god_admin) szerepkör módosíthatja a költségeket és
--     az árazási sávokat
--   - A gyülekezeteknek csak egy `current_pricing_tier_id` mező van a
--     `congregations` táblájukon (opcionális, manuálisan beállítható) — ha
--     nincs, akkor a tag-szám alapján automatikusan számolódik a megfelelő sáv
--
-- Forrás: `Egyhazi_Uzleti_Terv_2026_v2.docx` + `Egyhazi_Rendszer_Koltsegvetes_2026_v5.xlsx`
--
-- Idempotens — biztonsággal újrafuttatható.
-- =========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) system_finance_costs — havi rendszer-költségek tételenként
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_finance_costs (
  id bigserial PRIMARY KEY,
  kategoria text NOT NULL CHECK (kategoria IN (
    'supabase', 'vercel', 'storage', 'ai_gpu', 'ai_proxy', 'ai_monitoring',
    'mobile', 'monitoring', 'domain', 'egyszeri', 'egyeb'
  )),
  nev text NOT NULL,
  havi_usd numeric(10, 2) NOT NULL DEFAULT 0,
  havi_ron numeric(10, 2),  -- opcionális, ha USD-ben van a számla
  arfolyam_usd numeric(8, 4) DEFAULT 4.41,  -- USD→RON referencia árfolyam
  aktiv boolean NOT NULL DEFAULT true,
  sorszam int NOT NULL DEFAULT 0,
  megjegyzes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_finance_costs_aktiv
  ON public.system_finance_costs(aktiv);
CREATE INDEX IF NOT EXISTS idx_system_finance_costs_kategoria
  ON public.system_finance_costs(kategoria);

COMMENT ON TABLE public.system_finance_costs IS
  'Rendszer-szintű havi költségtételek (infrastruktúra, AI szerver, mobil, stb.). Csak god_admin szerkesztheti.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) system_pricing_tiers — tag-szám alapú árazási sávok
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_pricing_tiers (
  id bigserial PRIMARY KEY,
  nev text NOT NULL,  -- "Kis gyülekezet", "Közepes", stb.
  tipus text NOT NULL DEFAULT 'gyulekezet' CHECK (tipus IN (
    'gyulekezet', 'egyhazmegye', 'teszt', 'kedvezmeny'
  )),
  min_tagok int NOT NULL DEFAULT 0,
  max_tagok int,  -- NULL = felső határ nélküli
  havi_dij_ron numeric(10, 2) NOT NULL DEFAULT 0,
  eves_dij_ron numeric(10, 2) NOT NULL DEFAULT 0,  -- éves előfizetéshez (kedvezmény)
  aktiv boolean NOT NULL DEFAULT true,
  sorszam int NOT NULL DEFAULT 0,
  megjegyzes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_pricing_tiers_aktiv_tipus
  ON public.system_pricing_tiers(aktiv, tipus);

COMMENT ON TABLE public.system_pricing_tiers IS
  'Árazási sávok tag-szám alapján. Pl. "Kis gyülekezet (1-100 tag) 20 RON/hó".';

-- ─────────────────────────────────────────────────────────────────────────
-- 3) congregation_subscriptions — gyülekezetenkénti előfizetések
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.congregation_subscriptions (
  id bigserial PRIMARY KEY,
  congregation_id uuid NOT NULL REFERENCES public.congregations(id) ON DELETE CASCADE,
  pricing_tier_id bigint REFERENCES public.system_pricing_tiers(id),
  tipus text NOT NULL DEFAULT 'havi' CHECK (tipus IN (
    'havi', 'eves', 'teszt', 'kedvezmeny', 'ingyenes'
  )),
  /** Az aktuális havi/éves összeg — ha NULL, a pricing_tier_id alapján számolódik. */
  dij_ron numeric(10, 2),
  kezdet date NOT NULL DEFAULT CURRENT_DATE,
  veg date,  -- NULL = határozatlan idejű
  aktiv boolean NOT NULL DEFAULT true,
  megjegyzes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_congregation_subscriptions_congregation
  ON public.congregation_subscriptions(congregation_id, aktiv);

COMMENT ON TABLE public.congregation_subscriptions IS
  'Gyülekezetenkénti előfizetések (havi/éves/teszt/ingyenes). Egy gyülekezet több subscription-t is kaphat (historikus nyomon követés).';

-- ─────────────────────────────────────────────────────────────────────────
-- 4) RLS: csak rendszer-szintű admin szerkesztheti
-- ─────────────────────────────────────────────────────────────────────────
-- HIBAKÉPES (2026-04-18 Endre): az eredeti verzió `pr.user_id` és 'god_admin'
-- /'rendszergazda' role-ra hivatkozott, de a valós séma szerint:
--   - profile_roles.profile_id (NEM user_id), és profile_id = auth.uid()
--     (mivel profiles.id = auth.users.id)
--   - A role CHECK constraint NEM ismeri a 'god_admin' / 'rendszergazda'-t;
--     a legmagasabb szerep: `profiles.role = 'admin'`.
--   - A scope enum: 'system', 'district', 'diocese', 'congregation'
--     (NEM 'egyhazmegye' / 'egyhazkerulet' / 'gyulekezet').
--
-- Admin-ellenőrzés az egész rendszerben a sablonhoz: vagy `profiles.role =
-- 'admin'` (legegyszerűbb, ezt használja a `isAdminRole` is), vagy
-- `profile_roles` `scope = 'system'` + `role = 'admin'`.

ALTER TABLE public.system_finance_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.congregation_subscriptions ENABLE ROW LEVEL SECURITY;

-- GRANT-ok (3-layered rule)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_finance_costs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_pricing_tiers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.congregation_subscriptions TO authenticated;

-- Idempotens policy drop + create
-- Admin-check: profiles.role = 'admin' VAGY profile_roles system/admin active approved
DROP POLICY IF EXISTS "system_finance_costs_god_admin_all" ON public.system_finance_costs;
DROP POLICY IF EXISTS "system_finance_costs_admin_all" ON public.system_finance_costs;
CREATE POLICY "system_finance_costs_admin_all" ON public.system_finance_costs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.scope = 'system'
        AND pr.role = 'admin'
        AND pr.active = true
        AND pr.approval_status = 'approved'
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
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.scope = 'system'
        AND pr.role = 'admin'
        AND pr.active = true
        AND pr.approval_status = 'approved'
    )
  );

DROP POLICY IF EXISTS "system_pricing_tiers_god_admin_all" ON public.system_pricing_tiers;
DROP POLICY IF EXISTS "system_pricing_tiers_admin_all" ON public.system_pricing_tiers;
CREATE POLICY "system_pricing_tiers_admin_all" ON public.system_pricing_tiers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.scope = 'system'
        AND pr.role = 'admin'
        AND pr.active = true
        AND pr.approval_status = 'approved'
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
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.scope = 'system'
        AND pr.role = 'admin'
        AND pr.active = true
        AND pr.approval_status = 'approved'
    )
  );

DROP POLICY IF EXISTS "congregation_subscriptions_god_admin_all" ON public.congregation_subscriptions;
DROP POLICY IF EXISTS "congregation_subscriptions_admin_all" ON public.congregation_subscriptions;
CREATE POLICY "congregation_subscriptions_admin_all" ON public.congregation_subscriptions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.scope = 'system'
        AND pr.role = 'admin'
        AND pr.active = true
        AND pr.approval_status = 'approved'
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
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.scope = 'system'
        AND pr.role = 'admin'
        AND pr.active = true
        AND pr.approval_status = 'approved'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 5) SEED — az üzleti terv és költségvetés alapján (2026 április)
-- ─────────────────────────────────────────────────────────────────────────

-- Árazási sávok — "egyháztagok szerinti kiosztás" (Endre 2026-04-18)
INSERT INTO public.system_pricing_tiers (nev, tipus, min_tagok, max_tagok, havi_dij_ron, eves_dij_ron, sorszam, megjegyzes)
VALUES
  ('Kis gyülekezet',        'gyulekezet', 0,    100,  20.00,  200.00, 10, 'Kisebb teherviselő képesség; alapdíj.'),
  ('Közepes-kicsi',         'gyulekezet', 101,  200,  30.00,  300.00, 20, '100-200 fős gyülekezet.'),
  ('Közepes',               'gyulekezet', 201,  400,  45.00,  450.00, 30, '200-400 fős gyülekezet; alapszolgáltatás.'),
  ('Nagy gyülekezet',       'gyulekezet', 401,  800,  65.00,  650.00, 40, '400-800 fős gyülekezet; fokozott használat.'),
  ('Mega gyülekezet',       'gyulekezet', 801,  NULL, 90.00,  900.00, 50, '800+ fős gyülekezet; legnagyobb terhelés.'),
  ('Tesztidőszak (ingyen)', 'teszt',      0,    NULL,  0.00,    0.00,  5, 'Ingyenes próbaidőszak (első 2-3 hónap).'),
  ('Referencia gyülekezet', 'kedvezmeny', 0,    NULL, 25.00,  250.00, 60, '50% kedvezmény az első 20 gyülekezetnek.'),
  ('Egyházmegyei csomag',   'egyhazmegye', 0,   NULL,  0.00, 15000.00, 70, 'Egyházmegyei szintű szerződés — 30-60 gyülekezet egyben.')
ON CONFLICT DO NOTHING;

-- Havi költségtételek — Egyhazi_Rendszer_Koltsegvetes_2026_v5.xlsx alapján
-- (100 gyülekezet szcenárió + AI asszisztens)
INSERT INTO public.system_finance_costs (kategoria, nev, havi_usd, sorszam, megjegyzes)
VALUES
  -- Alap infrastruktúra
  ('supabase',      'Supabase Pro Plan',           25.00, 10, '8 GB adatbázis, 100 GB file, 100K MAU, 5M realtime üzenet.'),
  ('supabase',      'Supabase compute (Small)',    15.00, 11, '1000 felhasználóhoz Small compute javasolt.'),
  ('supabase',      'Supabase egress (~50 GB)',     4.50, 12, '50 GB × $0.09/GB adatforgalom.'),
  ('vercel',        'Vercel Pro Plan (1 fejl.)',   20.00, 20, 'Hosting, CI/CD, CDN, serverless.'),
  ('domain',        'Domain név (amortizált)',      1.25, 21, '$15/év ≈ havi amortizáció.'),

  -- Cloudflare R2
  ('storage',       'Cloudflare R2 storage (50 GB)', 0.75, 30, '50 GB × $0.015/GB/hó — NINCS egress díj.'),
  ('storage',       'R2 Class A műveletek (~2M)',    9.00, 31, '$4.50/millió × ~2M feltöltés/írás.'),
  ('storage',       'R2 Class B műveletek (~10M)',   3.60, 32, '$0.36/millió × ~10M olvasás.'),
  ('storage',       'R2 Infrequent Access (20 GB)',  0.20, 33, '$0.01/GB/hó archív adatok.'),

  -- Mobil
  ('mobile',        'Apple Developer Program',       8.25, 40, '$99/év amortizálva. Google Play egyszeri $25.'),

  -- Monitoring
  ('monitoring',    'Sentry Team',                  26.00, 50, '50K hiba/hó, performance monitoring.'),

  -- AI asszisztens
  ('ai_gpu',        'GPU A100 80GB (Vast.ai EU)', 489.00, 60, 'Qwen 2.5 72B Q5 — 50+ egyidejű felhasználó. EU GDPR.'),
  ('ai_proxy',      'Hetzner proxy (CPX21 EU)',     8.50, 61, 'vLLM proxy, load balancer, API gateway.'),
  ('ai_monitoring', 'AI monitoring (Langfuse)',     5.00, 62, 'Self-hosted audit log + RAG tracking.')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 6) updated_at trigger (auto-update)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_update_timestamp()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_system_finance_costs_updated ON public.system_finance_costs;
CREATE TRIGGER tg_system_finance_costs_updated
  BEFORE UPDATE ON public.system_finance_costs
  FOR EACH ROW EXECUTE FUNCTION public.tg_update_timestamp();

DROP TRIGGER IF EXISTS tg_system_pricing_tiers_updated ON public.system_pricing_tiers;
CREATE TRIGGER tg_system_pricing_tiers_updated
  BEFORE UPDATE ON public.system_pricing_tiers
  FOR EACH ROW EXECUTE FUNCTION public.tg_update_timestamp();

DROP TRIGGER IF EXISTS tg_congregation_subscriptions_updated ON public.congregation_subscriptions;
CREATE TRIGGER tg_congregation_subscriptions_updated
  BEFORE UPDATE ON public.congregation_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_update_timestamp();

-- =========================================================================
-- ELLENŐRZÉS
-- =========================================================================

-- a) Táblák létrehozása
-- (pg_indexes oszlopai: schemaname, tablename, indexname, tablespace, indexdef
--  — NEM `indexrelname` (Endre 2026-04-18 javítás után))
SELECT
  t.tablename,
  (SELECT count(*) FROM pg_indexes i
   WHERE i.schemaname = 'public'
     AND i.tablename = t.tablename
     AND i.indexname LIKE 'idx_' || t.tablename || '%') AS index_count
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND t.tablename IN ('system_finance_costs', 'system_pricing_tiers', 'congregation_subscriptions')
ORDER BY t.tablename;

-- b) Seed-ek
SELECT 'system_finance_costs' AS tabla, COUNT(*) AS db FROM public.system_finance_costs
UNION ALL
SELECT 'system_pricing_tiers', COUNT(*) FROM public.system_pricing_tiers
UNION ALL
SELECT 'congregation_subscriptions', COUNT(*) FROM public.congregation_subscriptions;

-- c) Árazási sávok listája
SELECT id, nev, tipus, min_tagok, max_tagok, havi_dij_ron, eves_dij_ron
FROM public.system_pricing_tiers
ORDER BY sorszam;

-- d) Költségtételek összegzve
SELECT
  kategoria,
  COUNT(*) AS tetel_db,
  SUM(havi_usd) AS havi_usd_osszesen,
  ROUND(SUM(havi_usd) * 4.41, 2) AS havi_ron_osszesen
FROM public.system_finance_costs
WHERE aktiv = true
GROUP BY kategoria
ORDER BY SUM(havi_usd) DESC;

-- e) RLS policy ellenőrzés
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('system_finance_costs', 'system_pricing_tiers', 'congregation_subscriptions')
ORDER BY tablename, policyname;

-- ─────────────────────────────────────────────────────────────────────────
-- 6) PostgREST schema cache reload
-- ─────────────────────────────────────────────────────────────────────────
-- Endre 2026-04-18: „Could not find the table 'public.system_finance_costs'
-- in the schema cache" hibát kaptunk. Ez a Supabase PostgREST standard
-- viselkedése új táblák létrehozása után — a schema cache nem frissül
-- automatikusan. A `NOTIFY pgrst, 'reload schema';` parancs kikényszeríti
-- a cache frissítést. Enélkül a kliens addig nem látja az új táblákat, amíg
-- a Supabase Dashboard Settings → API → „Reload schema cache" gombját
-- meg nem nyomják (vagy kb. 10 percet nem várnak).
NOTIFY pgrst, 'reload schema';
