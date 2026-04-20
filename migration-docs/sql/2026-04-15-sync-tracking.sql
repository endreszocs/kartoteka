-- ═══════════════════════════════════════════════════════════════
-- PWA OFFLINE-FIRST: Sync tracking columns + triggers (2026-04-15)
-- ═══════════════════════════════════════════════════════════════
--
-- Ez a migráció bevezeti az optimistic locking + delta sync alapját:
--   - `revision bigint default 0` — minden UPDATE inkrementálja
--   - `updated_at timestamptz default now()` — minden UPDATE frissíti
--   - `BEFORE UPDATE` trigger: automatikusan karbantartja mindkettőt
--
-- A kliens (Dexie) az `updated_at > lastPullAt` delta query-vel hozza
-- le a változásokat (pull sync). A client UPDATE kérésekor a rendszer
-- `WHERE id = ? AND revision = baseRevision` feltétellel próbálja
-- írni — ha 0 sor érintett → 409 Conflict, a kliens oldalon dialog.
--
-- HATÓKÖR:
--   ✅ Aktív user-editable táblákra (CRUD-intenzív modul táblák)
--   ❌ Reference/lookup táblákra (adrcountry, adrcounty, stb.)
--   ❌ Config táblákra (system_settings, bealitas ritkán változik)
--   ❌ Append-only log táblákra (import_logs, logger, event — nincs UPDATE)
--
-- EZT NEM TESZEM (tábla már tartalmaz updated_at oszlopot, de revision-t igen):
--   mm_otletek, mm_segedanyagok, presbiteri_jegyzokonyvek, public_sites,
--   public_magazines, public_posts, public_magazine_issues, pastor_profiles,
--   congregation_annual_fees, gyulekezeti_programok, system_settings
--
-- ═══════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────
-- 1. Univerzális trigger függvény
-- ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_tracking_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.revision = COALESCE(OLD.revision, 0) + 1;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_tracking_touch() IS
  'PWA offline-first sync: minden UPDATE-nél auto-incrementeli a revision-t
   és beállítja az updated_at-ot. Minden sync-tracked táblára be kell kötni
   BEFORE UPDATE triggerként.';

-- ───────────────────────────────────────────────────────────────
-- 2. Segéd-makró (psql only, ha kézzel futtatjuk) — itt kézzel írjuk
-- ───────────────────────────────────────────────────────────────
-- A DO blokk dinamikusan kezelné, de a migrációnak explicitnek kell
-- lennie és egyszer futónak. Ezért kézzel soroljuk fel a táblákat.

-- ───────────────────────────────────────────────────────────────
-- 3. TAGNYILVÁNTARTÁS modul
-- ───────────────────────────────────────────────────────────────

-- szemely
ALTER TABLE public.szemely
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_szemely ON public.szemely;
CREATE TRIGGER trg_sync_szemely
  BEFORE UPDATE ON public.szemely
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- csalad
ALTER TABLE public.csalad
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_csalad ON public.csalad;
CREATE TRIGGER trg_sync_csalad
  BEFORE UPDATE ON public.csalad
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- presbiter
ALTER TABLE public.presbiter
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_presbiter ON public.presbiter;
CREATE TRIGGER trg_sync_presbiter
  BEFORE UPDATE ON public.presbiter
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- gyerek
ALTER TABLE public.gyerek
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_gyerek ON public.gyerek;
CREATE TRIGGER trg_sync_gyerek
  BEFORE UPDATE ON public.gyerek
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- felmentes
ALTER TABLE public.felmentes
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_felmentes ON public.felmentes;
CREATE TRIGGER trg_sync_felmentes
  BEFORE UPDATE ON public.felmentes
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- attert
ALTER TABLE public.attert
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_attert ON public.attert;
CREATE TRIGGER trg_sync_attert
  BEFORE UPDATE ON public.attert
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- kitert
ALTER TABLE public.kitert
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_kitert ON public.kitert;
CREATE TRIGGER trg_sync_kitert
  BEFORE UPDATE ON public.kitert
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- bekoltozott
ALTER TABLE public.bekoltozott
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_bekoltozott ON public.bekoltozott;
CREATE TRIGGER trg_sync_bekoltozott
  BEFORE UPDATE ON public.bekoltozott
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- elkoltozott
ALTER TABLE public.elkoltozott
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_elkoltozott ON public.elkoltozott;
CREATE TRIGGER trg_sync_elkoltozott
  BEFORE UPDATE ON public.elkoltozott
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- csaladlatogatas
ALTER TABLE public.csaladlatogatas
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_csaladlatogatas ON public.csaladlatogatas;
CREATE TRIGGER trg_sync_csaladlatogatas
  BEFORE UPDATE ON public.csaladlatogatas
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- csoport
ALTER TABLE public.csoport
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_csoport ON public.csoport;
CREATE TRIGGER trg_sync_csoport
  BEFORE UPDATE ON public.csoport
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- ───────────────────────────────────────────────────────────────
-- 4. PÉNZÜGY modul
-- ───────────────────────────────────────────────────────────────

-- befizetes
ALTER TABLE public.befizetes
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_befizetes ON public.befizetes;
CREATE TRIGGER trg_sync_befizetes
  BEFORE UPDATE ON public.befizetes
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- kiadas
ALTER TABLE public.kiadas
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_kiadas ON public.kiadas;
CREATE TRIGGER trg_sync_kiadas
  BEFORE UPDATE ON public.kiadas
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- belsomozgas
ALTER TABLE public.belsomozgas
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_belsomozgas ON public.belsomozgas;
CREATE TRIGGER trg_sync_belsomozgas
  BEFORE UPDATE ON public.belsomozgas
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- bankszamlak
ALTER TABLE public.bankszamlak
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_bankszamlak ON public.bankszamlak;
CREATE TRIGGER trg_sync_bankszamlak
  BEFORE UPDATE ON public.bankszamlak
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- berleti_szerzodes
ALTER TABLE public.berleti_szerzodes
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_berleti_szerzodes ON public.berleti_szerzodes;
CREATE TRIGGER trg_sync_berleti_szerzodes
  BEFORE UPDATE ON public.berleti_szerzodes
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- koltsegvetes
ALTER TABLE public.koltsegvetes
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_koltsegvetes ON public.koltsegvetes;
CREATE TRIGGER trg_sync_koltsegvetes
  BEFORE UPDATE ON public.koltsegvetes
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- valuta_atert
ALTER TABLE public.valuta_atert
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_valuta_atert ON public.valuta_atert;
CREATE TRIGGER trg_sync_valuta_atert
  BEFORE UPDATE ON public.valuta_atert
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- monetar
ALTER TABLE public.monetar
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_monetar ON public.monetar;
CREATE TRIGGER trg_sync_monetar
  BEFORE UPDATE ON public.monetar
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- kiadasikiseroiv
ALTER TABLE public.kiadasikiseroiv
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_kiadasikiseroiv ON public.kiadasikiseroiv;
CREATE TRIGGER trg_sync_kiadasikiseroiv
  BEFORE UPDATE ON public.kiadasikiseroiv
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_transactions ON public.transactions;
CREATE TRIGGER trg_sync_transactions
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- ───────────────────────────────────────────────────────────────
-- 5. ANYAKÖNYV modul
-- ───────────────────────────────────────────────────────────────

-- keresztseg
ALTER TABLE public.keresztseg
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_keresztseg ON public.keresztseg;
CREATE TRIGGER trg_sync_keresztseg
  BEFORE UPDATE ON public.keresztseg
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- konfirmalas
ALTER TABLE public.konfirmalas
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_konfirmalas ON public.konfirmalas;
CREATE TRIGGER trg_sync_konfirmalas
  BEFORE UPDATE ON public.konfirmalas
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- hazassag
ALTER TABLE public.hazassag
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_hazassag ON public.hazassag;
CREATE TRIGGER trg_sync_hazassag
  BEFORE UPDATE ON public.hazassag
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- temetes
ALTER TABLE public.temetes
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_temetes ON public.temetes;
CREATE TRIGGER trg_sync_temetes
  BEFORE UPDATE ON public.temetes
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- ───────────────────────────────────────────────────────────────
-- 6. MUNKANAPLÓ modul
-- ───────────────────────────────────────────────────────────────

ALTER TABLE public.munkanaplo
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_munkanaplo ON public.munkanaplo;
CREATE TRIGGER trg_sync_munkanaplo
  BEFORE UPDATE ON public.munkanaplo
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- ───────────────────────────────────────────────────────────────
-- 7. LELTÁR modul
-- ───────────────────────────────────────────────────────────────

ALTER TABLE public.leltar_tetelek
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_leltar_tetelek ON public.leltar_tetelek;
CREATE TRIGGER trg_sync_leltar_tetelek
  BEFORE UPDATE ON public.leltar_tetelek
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- ───────────────────────────────────────────────────────────────
-- 8. IKTATÓ modul
-- ───────────────────────────────────────────────────────────────

-- iktato
ALTER TABLE public.iktato
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_iktato ON public.iktato;
CREATE TRIGGER trg_sync_iktato
  BEFORE UPDATE ON public.iktato
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- iktato_sablonok (E3-ból — updated_at már van, csak revision kell)
ALTER TABLE public.iktato_sablonok
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
-- A meglévő updated_at trigger a `iktato_sablonok_set_updated_at`-ot használja,
-- NEM kell a sync_tracking_touch. Helyette módosítsuk a meglévő triggert úgy,
-- hogy a revision-t is frissítse:
CREATE OR REPLACE FUNCTION public.iktato_sablonok_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.revision = COALESCE(OLD.revision, 0) + 1;
  RETURN NEW;
END;
$$;

-- ───────────────────────────────────────────────────────────────
-- 9. SÍRHELY modul
-- ───────────────────────────────────────────────────────────────

ALTER TABLE public.sirhelytemeto
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_sirhelytemeto ON public.sirhelytemeto;
CREATE TRIGGER trg_sync_sirhelytemeto
  BEFORE UPDATE ON public.sirhelytemeto
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

ALTER TABLE public.sirhely
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_sirhely ON public.sirhely;
CREATE TRIGGER trg_sync_sirhely
  BEFORE UPDATE ON public.sirhely
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

ALTER TABLE public.sirhelyberles
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_sirhelyberles ON public.sirhelyberles;
CREATE TRIGGER trg_sync_sirhelyberles
  BEFORE UPDATE ON public.sirhelyberles
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

ALTER TABLE public.sirhelyelhunyt
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_sirhelyelhunyt ON public.sirhelyelhunyt;
CREATE TRIGGER trg_sync_sirhelyelhunyt
  BEFORE UPDATE ON public.sirhelyelhunyt
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- ───────────────────────────────────────────────────────────────
-- 10. JEGYZŐKÖNYVEK modul
-- ───────────────────────────────────────────────────────────────

-- presbiteri_jegyzokonyvek (updated_at már van)
ALTER TABLE public.presbiteri_jegyzokonyvek
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
DROP TRIGGER IF EXISTS trg_sync_presbiteri_jegyzokonyvek ON public.presbiteri_jegyzokonyvek;
CREATE TRIGGER trg_sync_presbiteri_jegyzokonyvek
  BEFORE UPDATE ON public.presbiteri_jegyzokonyvek
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

ALTER TABLE public.jegyzokonyv_hatarozatok
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_jegyzokonyv_hatarozatok ON public.jegyzokonyv_hatarozatok;
CREATE TRIGGER trg_sync_jegyzokonyv_hatarozatok
  BEFORE UPDATE ON public.jegyzokonyv_hatarozatok
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

ALTER TABLE public.jegyzokonyv_napirendi_pontok
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_jegyzokonyv_napirendi_pontok ON public.jegyzokonyv_napirendi_pontok;
CREATE TRIGGER trg_sync_jegyzokonyv_napirendi_pontok
  BEFORE UPDATE ON public.jegyzokonyv_napirendi_pontok
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

ALTER TABLE public.jegyzokonyv_resztvevok
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_jegyzokonyv_resztvevok ON public.jegyzokonyv_resztvevok;
CREATE TRIGGER trg_sync_jegyzokonyv_resztvevok
  BEFORE UPDATE ON public.jegyzokonyv_resztvevok
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- ───────────────────────────────────────────────────────────────
-- 11. MISSZIÓS MŰHELY modul (csak bookmarkolt tartalmak sync-elendők)
-- ───────────────────────────────────────────────────────────────

-- mm_otletek (updated_at már van)
ALTER TABLE public.mm_otletek
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
DROP TRIGGER IF EXISTS trg_sync_mm_otletek ON public.mm_otletek;
CREATE TRIGGER trg_sync_mm_otletek
  BEFORE UPDATE ON public.mm_otletek
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

ALTER TABLE public.mm_feladatok
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_mm_feladatok ON public.mm_feladatok;
CREATE TRIGGER trg_sync_mm_feladatok
  BEFORE UPDATE ON public.mm_feladatok
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

ALTER TABLE public.mm_merfoldkovek
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_mm_merfoldkovek ON public.mm_merfoldkovek;
CREATE TRIGGER trg_sync_mm_merfoldkovek
  BEFORE UPDATE ON public.mm_merfoldkovek
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

ALTER TABLE public.mm_dokumentumok
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS trg_sync_mm_dokumentumok ON public.mm_dokumentumok;
CREATE TRIGGER trg_sync_mm_dokumentumok
  BEFORE UPDATE ON public.mm_dokumentumok
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- ───────────────────────────────────────────────────────────────
-- 12. ÚJABB MODULOK (az elmúlt hónapok E-feladatai)
-- ───────────────────────────────────────────────────────────────

-- annual_reports (C1 modul)
ALTER TABLE public.annual_reports
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
-- updated_at már van. Szükséges a trigger explicit:
DROP TRIGGER IF EXISTS trg_sync_annual_reports ON public.annual_reports;
CREATE TRIGGER trg_sync_annual_reports
  BEFORE UPDATE ON public.annual_reports
  FOR EACH ROW EXECUTE FUNCTION public.sync_tracking_touch();

-- ═══════════════════════════════════════════════════════════════
-- VERIFIKÁCIÓ (futtatás UTÁN):
-- ═══════════════════════════════════════════════════════════════
--
-- 1. Az érintett táblákon megjelent a revision + updated_at:
--    SELECT table_name, column_name
--      FROM information_schema.columns
--      WHERE table_schema = 'public'
--        AND column_name IN ('revision', 'updated_at')
--      ORDER BY table_name, column_name;
--
-- 2. A triggerek megvannak:
--    SELECT event_object_table AS tabla, trigger_name
--      FROM information_schema.triggers
--      WHERE trigger_name LIKE 'trg_sync_%'
--      ORDER BY event_object_table;
--
-- 3. Smoke teszt: egy UPDATE automatikusan frissíti a revision-t
--    SELECT id, revision, updated_at FROM szemely ORDER BY id LIMIT 1;
--    UPDATE szemely SET telefon = telefon WHERE id = <first_id>;
--    SELECT id, revision, updated_at FROM szemely WHERE id = <first_id>;
--    -- A revision +1-gyel nagyobb kell legyen, updated_at frissebb
--
-- ═══════════════════════════════════════════════════════════════
