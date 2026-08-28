-- ═══════════════════════════════════════════════════════════════════════════
-- BEVÉTEL-OLDALI PARTNER-NYILVÁNTARTÁS (Endre 2026-08-28-i kérése)
--
-- MIÉRT: a banki bevételeknél (adomány, szponzortámogatás, egyházfenntartás,
-- bérjövedelem) tudni kell, KI fizetett — és ha a pénztáros egyszer már
-- hozzárendelte a kivonatban szereplő névhez a tagot (vagy beírta a
-- cégnevet), a rendszer JEGYEZZE MEG: a következő banki importnál magától
-- alkalmazza. Cél: az éves adományozó/szponzor-áttekintés (Adományozók fül)
-- teljes képet adjon. A kiadás-oldalon van cégnyilvántartás — a bevételi
-- oldalon eddig SEMMI nem őrizte a párosítást.
--
-- MIT CSINÁL: új `bevetel_partner` tábla — a banki kivonat NYERS partner-neve
-- (normalizált kulcs) → tag (szemely_id) VAGY szabad szöveges név/cégnév.
-- Gyülekezetenként egyedi kulcs; a szokásos gyülekezeti RLS-mintával
-- (roles-first + skalár + globális láb — a repó hibaosztály-szabálya szerint).
--
-- MIT NEM CSINÁL: meglévő adatot nem ír át; a meglévő RLS-eken nem változtat.
--
-- SORREND: fusson a kód-deploy ELŐTT (az app olvassa/írja a táblát; enélkül
-- a memória-funkció hangos hibát adna — az import maga attól még működik).
-- FUTTATÁS: Supabase SQL editor, egyben. Újrafuttatható.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.bevetel_partner (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES public.congregations(id),
  -- A banki kivonat partner-neve NORMALIZÁLVA (kisbetű, trim, többes szóköz
  -- össze) — az app normalizál, itt csak tároljuk. ⚠️ Írásjelet NEM vetünk el
  -- („S.A." ≠ „SA" — a repó dokumentált csapdája).
  nyers_nev text NOT NULL,
  -- A megjegyzett cél: VAGY tag, VAGY szabad szöveges név/cégnév.
  szemely_id integer NULL REFERENCES public.szemely(id),
  megjelenites_nev text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bevetel_partner_cel_check
    CHECK (szemely_id IS NOT NULL OR megjelenites_nev IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_bevetel_partner_nev
  ON public.bevetel_partner (congregation_id, nyers_nev);

ALTER TABLE public.bevetel_partner ENABLE ROW LEVEL SECURITY;

-- A négy művelet ugyanazzal a hatókör-feltétellel (a szallitoi_szamla
-- 2026-08-15-ös mintája BETŰRE): roles-first + skalár + globális láb.
DROP POLICY IF EXISTS bevetel_partner_select_own ON public.bevetel_partner;
CREATE POLICY bevetel_partner_select_own
  ON public.bevetel_partner
  FOR SELECT
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = bevetel_partner.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

DROP POLICY IF EXISTS bevetel_partner_insert_own ON public.bevetel_partner;
CREATE POLICY bevetel_partner_insert_own
  ON public.bevetel_partner
  FOR INSERT
  TO authenticated
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = bevetel_partner.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

DROP POLICY IF EXISTS bevetel_partner_update_own ON public.bevetel_partner;
CREATE POLICY bevetel_partner_update_own
  ON public.bevetel_partner
  FOR UPDATE
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = bevetel_partner.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  )
  WITH CHECK (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = bevetel_partner.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

DROP POLICY IF EXISTS bevetel_partner_delete_own ON public.bevetel_partner;
CREATE POLICY bevetel_partner_delete_own
  ON public.bevetel_partner
  FOR DELETE
  TO authenticated
  USING (
    congregation_id = current_user_congregation_id()
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = (SELECT auth.uid())
        AND pr.scope = 'congregation'
        AND pr.scope_id = bevetel_partner.congregation_id
        AND pr.active
        AND pr.approval_status = 'approved'
    )
    OR current_user_has_global_access()
  );

-- GRANT — RLS önmagában nem elég (42501 nélküle).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bevetel_partner TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- ELLENŐRZŐ RÁCS — EGY eredményrácsban.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bevetel_partner'
  ) THEN '✅ 1. bevetel_partner tábla létezik'
    ELSE '⛔ 1. a tábla HIÁNYZIK' END AS ellenorzes
UNION ALL
SELECT
  CASE WHEN (
    SELECT COUNT(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bevetel_partner'
  ) = 4
  THEN '✅ 2. mind a 4 RLS-policy áll'
  ELSE '⛔ 2. hiányzó RLS-policy' END
UNION ALL
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uniq_bevetel_partner_nev'
  ) THEN '✅ 3. az egyediségi index áll (congregation + nyers_nev)'
    ELSE '⛔ 3. az egyediségi index HIÁNYZIK' END
UNION ALL
SELECT
  CASE WHEN has_table_privilege('authenticated', 'public.bevetel_partner', 'SELECT')
   AND NOT has_table_privilege('anon', 'public.bevetel_partner', 'SELECT')
  THEN '✅ 4. jogosultság: authenticated IGEN, anon NEM'
  ELSE '⛔ 4. a GRANT nem a várt állapotban' END
ORDER BY 1;
