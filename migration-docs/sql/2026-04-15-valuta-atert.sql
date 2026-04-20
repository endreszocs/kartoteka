-- ═══════════════════════════════════════════════════════════════════════════
-- VALUTA_ATERT TÁBLA — Devizás átértékelés (FX revaluation) audit trail
-- Dátum: 2026-04-15
-- Feladat: B2 — Devizás átértékelés modul
-- Projekt log: 026. lépés
--
-- CÉL:
-- Az erdélyi gyülekezetek egy része EUR (ritkábban HUF) bankszámlát is vezet.
-- Év végén a könyvi árfolyam (a tranzakció időpontján rögzített) és a piaci
-- BNR árfolyam eltér. Az IAS 21 / IFRS 9 szerint az év végi devizás eszközöket
-- át kell értékelni — a különbözet könyvi nyereség (befizetes 103.04 kód)
-- vagy veszteség (kiadas 203.03 kód).
--
-- Ez a tábla AUDIT TRAIL — a tényleges könyvi sorok a befizetes / kiadas
-- táblákban keletkeznek (a 103.04 / 203.03 kódokkal, dec 31-i dátummal).
-- A valuta_atert sor csak a számítás dokumentációja: melyik árfolyamon,
-- mekkora deviza-egyenleget, milyen különbözettel.
--
-- IDEMPOTENS: a `IF NOT EXISTS` és a unique constraint többszöri futtatást
-- megenged (de a unique index miatt egy év / egy bankszámla = egy rekord).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. TÁBLA LÉTREHOZÁS ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.valuta_atert (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Szervezeti hovatartozás (RLS-hez)
  congregation_id  uuid NOT NULL REFERENCES public.congregations(id),

  -- Mely bankszámlára vonatkozik az átértékelés
  bankszamla_id    integer NOT NULL REFERENCES public.bankszamlak(id),

  -- Mely év végéhez tartozik (általában: tárgyév-1, mert utólag könyvelünk)
  ev               integer NOT NULL,

  -- Devizadat
  valuta           varchar(3) NOT NULL,           -- 'EUR', 'HUF', stb.
  deviza_egyenleg  numeric NOT NULL,              -- pl. 1000.00 EUR

  -- Régi (könyv szerinti) érték
  regi_arfolyam    numeric(10,4),                 -- pl. 4.8000 RON/EUR (kalkulált, opcionális)
  regi_ron_ertek   numeric NOT NULL,              -- pl. 4800.00 RON

  -- Új (BNR vagy manuális) érték
  uj_arfolyam      numeric(10,4) NOT NULL,        -- pl. 4.9532 RON/EUR
  uj_ron_ertek     numeric NOT NULL,              -- pl. 4953.20 RON

  -- Különbözet és típus
  kulonbozet       numeric NOT NULL,              -- = uj_ron_ertek - regi_ron_ertek
  tipus            text NOT NULL CHECK (tipus IN ('nyereseg', 'veszteseg', 'nulla')),

  -- Forrás dokumentáció
  arfolyam_datum   date NOT NULL DEFAULT CURRENT_DATE,
  arfolyam_forras  varchar(50) NOT NULL DEFAULT 'BNR',  -- 'BNR' vagy 'manual'

  -- Linkek a generált könyvi sorokra (az egyiknek kell lennie, a másik NULL)
  befizetes_id     bigint REFERENCES public.befizetes(id) ON DELETE SET NULL,
  kiadas_id        bigint REFERENCES public.kiadas(id) ON DELETE SET NULL,

  -- Megjegyzés
  megjegyzes       text,

  -- Audit
  userid           uuid NOT NULL REFERENCES auth.users(id),
  created_at       timestamp with time zone DEFAULT now(),

  -- Soft delete
  deleted          boolean DEFAULT false,

  -- Egy bankszámlára egy évben egy átértékelés (UNIQUE constraint)
  -- Ha kell javítás, töröljük a régit (soft delete) és újat veszünk fel.
  CONSTRAINT valuta_atert_unique_per_bank_year
    UNIQUE (congregation_id, bankszamla_id, ev, deleted)
);

-- ── 2. INDEXEK ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_valuta_atert_cong_ev
  ON public.valuta_atert (congregation_id, ev);

CREATE INDEX IF NOT EXISTS idx_valuta_atert_bank
  ON public.valuta_atert (bankszamla_id);

CREATE INDEX IF NOT EXISTS idx_valuta_atert_befizetes
  ON public.valuta_atert (befizetes_id) WHERE befizetes_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_valuta_atert_kiadas
  ON public.valuta_atert (kiadas_id) WHERE kiadas_id IS NOT NULL;

-- ── 3. ROW LEVEL SECURITY ──────────────────────────────────────

ALTER TABLE public.valuta_atert ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.valuta_atert TO authenticated;

-- SELECT: csak a saját gyülekezet vagy global access
DROP POLICY IF EXISTS valuta_atert_select_own ON public.valuta_atert;
CREATE POLICY valuta_atert_select_own
  ON public.valuta_atert
  FOR SELECT
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR current_user_has_global_access()
  );

-- INSERT: csak a saját gyülekezetbe
DROP POLICY IF EXISTS valuta_atert_insert_own ON public.valuta_atert;
CREATE POLICY valuta_atert_insert_own
  ON public.valuta_atert
  FOR INSERT
  TO authenticated
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR current_user_has_global_access()
  );

-- UPDATE: csak a saját gyülekezeté
DROP POLICY IF EXISTS valuta_atert_update_own ON public.valuta_atert;
CREATE POLICY valuta_atert_update_own
  ON public.valuta_atert
  FOR UPDATE
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR current_user_has_global_access()
  )
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR current_user_has_global_access()
  );

-- DELETE: csak a saját gyülekezeté (de inkább a soft delete-et használjuk)
DROP POLICY IF EXISTS valuta_atert_delete_own ON public.valuta_atert;
CREATE POLICY valuta_atert_delete_own
  ON public.valuta_atert
  FOR DELETE
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR current_user_has_global_access()
  );

-- ── 4. VERIFIKÁCIÓ (futtasd kézzel a migráció után) ──────────

-- 4a. RLS aktív?
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'valuta_atert';
--   → 1 sor, rowsecurity = true

-- 4b. A 4 policy létrejött?
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'valuta_atert'
--   ORDER BY cmd, policyname;
--   → 4 sor: select, insert, update, delete

-- 4c. A 103.04 / 203.03 számadási célok léteznek-e?
--   SELECT id_szamadasicel FROM befizetescel WHERE id_szamadasicel = '103.04';
--   SELECT id_szamadasicel FROM kiadascel WHERE id_szamadasicel = '203.03';
--   → Ha 0 sor, manuálisan vegyétek fel a Beállítások menüben — különben
--   a B2 modul nem fog tudni nyereség/veszteség sort létrehozni.

-- ═══════════════════════════════════════════════════════════════════════════
-- VÉGE
-- ═══════════════════════════════════════════════════════════════════════════
