-- ═══════════════════════════════════════════════════════════════════════════
-- PÉNZÜGYI VÁLTOZÁSNAPLÓ + 5 ÉVES KUKA-MEGŐRZÉS (P4-26, audit 2026-08-28)
-- Endre döntése (2026-08-29): „legyen 5 év, öt év után törlődnek."
-- Futtatás: Supabase SQL editor, EGYBEN. Idempotens.
--
-- MIT CSINÁL:
--  1) ÚJ trigger-alapú változásnapló (penzugy_valtozas_naplo) a befizetes /
--     kiadas / belsomozgas táblákon: MINDEN módosítás és törlés előtti sor
--     JSON-ban megőrződik, a végrehajtó user azonosítójával. Eddig a
--     pénzügyben SEMMI nem rögzítette, KI módosított/törölt (nincs
--     updated_by/deleted_by), és a cron-purge nyom nélkül vitte el a sort.
--  2) A Kuka-purge a PÉNZÜGYI táblákra 30 nap helyett 5 ÉVIG őrzi a törölt
--     sort (bizonylat-megőrzés); minden más tábla marad 30 nap.
--  3) A változásnapló maga is 5 évig él — az ennél régebbi bejegyzéseket a
--     napi purge takarítja.
--
-- A purge-törzs FORRÁSA a 2026-08-17-S5a (élesben futó) változat, betűhűen —
-- az EGYETLEN érdemi eltérés a táblánkénti megőrzési idő (3. terv-oszlop).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) A VÁLTOZÁSNAPLÓ TÁBLA ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.penzugy_valtozas_naplo (
  id               BIGSERIAL PRIMARY KEY,
  tabla            TEXT NOT NULL,
  sor_id           BIGINT NOT NULL,
  congregation_id  UUID,
  muvelet          TEXT NOT NULL CHECK (muvelet IN ('UPDATE', 'DELETE')),
  -- A végrehajtó user (auth.uid()); a pg_cron-ból futó purge-nél NULL.
  aktor            UUID,
  -- A sor MÓDOSÍTÁS/TÖRLÉS ELŐTTI teljes állapota.
  regi_sor         JSONB NOT NULL,
  letrejott        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pvn_tabla_sor
  ON public.penzugy_valtozas_naplo (tabla, sor_id);
CREATE INDEX IF NOT EXISTS idx_pvn_congregation
  ON public.penzugy_valtozas_naplo (congregation_id, letrejott DESC);
CREATE INDEX IF NOT EXISTS idx_pvn_letrejott
  ON public.penzugy_valtozas_naplo (letrejott);

COMMENT ON TABLE public.penzugy_valtozas_naplo IS
  'Pénzügyi változásnapló (P4-26, 2026-08-29): a befizetes/kiadas/belsomozgas minden UPDATE/DELETE előtti sora, a végrehajtóval. Append-only; 5 év után a purge takarítja.';

-- RLS: append-only — a kliens NEM írhat/módosíthat/törölhet (a triggerek
-- SECURITY DEFINER-rel írnak); olvasni az aktív admin/master olvashat
-- (a data_wipe_log 2026-08-11-es mintája szerint).
ALTER TABLE public.penzugy_valtozas_naplo ENABLE ROW LEVEL SECURITY;

DO $rls$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'penzugy_valtozas_naplo'
      AND policyname = 'pvn_admin_select'
  ) THEN
    CREATE POLICY pvn_admin_select ON public.penzugy_valtozas_naplo
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('admin', 'master')
            AND COALESCE(p.approved, true) = true
        )
      );
  END IF;
END
$rls$;

GRANT SELECT ON public.penzugy_valtozas_naplo TO authenticated;
-- A Supabase default-privilege-ek miatt EXPLICIT revoke — az RLS (nincs
-- INSERT/UPDATE/DELETE policy) amúgy is tiltana, ez a második réteg.
REVOKE INSERT, UPDATE, DELETE ON public.penzugy_valtozas_naplo FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.penzugy_valtozas_naplo FROM anon;

-- ── 2) A NAPLÓZÓ TRIGGER-FÜGGVÉNY ───────────────────────────────────────────
-- SECURITY DEFINER: a kliens RLS-e nem akadályozza a napló-írást, és a
-- kliens közvetlenül akkor sem írhat a naplóba, ha a trigger nem fut.

CREATE OR REPLACE FUNCTION public.penzugy_valtozas_naplo_iro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $trg$
BEGIN
  INSERT INTO public.penzugy_valtozas_naplo
    (tabla, sor_id, congregation_id, muvelet, aktor, regi_sor)
  VALUES (
    TG_TABLE_NAME,
    OLD.id,
    OLD.congregation_id,
    TG_OP,
    auth.uid(),
    to_jsonb(OLD)
  );
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A napló-írás hibája NEM akaszthatja meg magát a pénzügyi műveletet —
  -- de hangosan jelezzük a szerver-logban.
  RAISE WARNING 'penzugy_valtozas_naplo_iro: a naplózás nem sikerült (% %.%): %',
    TG_OP, TG_TABLE_NAME, OLD.id, SQLERRM;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$trg$;

DO $trg_install$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['befizetes', 'kiadas', 'belsomozgas'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE WARNING 'penzugy_valtozas_naplo: a(z) % tábla nem létezik — trigger kihagyva', t;
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_pvn_update_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_pvn_update_%I AFTER UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.penzugy_valtozas_naplo_iro()',
      t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_pvn_delete_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_pvn_delete_%I AFTER DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.penzugy_valtozas_naplo_iro()',
      t, t);
  END LOOP;
END
$trg_install$;

-- ── 3) PURGE: PÉNZÜGYI TÁBLÁK 5 ÉV, MINDEN MÁS 30 NAP ──────────────────────
-- A törzs a 2026-08-17-S5a élő változata BETŰHŰEN; az egyetlen érdemi
-- eltérés: a terv 3. oszlopa a megőrzési napok száma (1825 = 5 év a
-- pénzügyi táblákon), + a futás végén a változásnapló 5 éves takarítása.

DROP FUNCTION IF EXISTS public.purge_recycle_bin();

CREATE FUNCTION public.purge_recycle_bin()
RETURNS table(tbl text, deleted_count bigint, skipped_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $purge$
DECLARE
  -- FORRÁS: 2026-08-14-kuka-deleted-at.sql:182-199 — betűhűen; a 3. oszlop
  -- a megőrzési NAPOK száma (P4-26, 2026-08-29: pénzügy = 1825 nap = 5 év).
  terv text[][] := ARRAY[
    ARRAY['berleti_szerzodes', 'deleted',    '30'],
    ARRAY['iktato',            'deleted',    '30'],
    ARRAY['iktato_sablonok',   'deleted',    '30'],
    -- sírhely-blokk gyerek-először (FK: sirhelyelhunyt.sirhelyid → sirhely,
    -- sirhelyberles.sirhelyid → sirhely, sirhely.temetoid → sirhelytemeto)
    ARRAY['sirhelyelhunyt',    'deleted',    '30'],
    ARRAY['sirhelyberles',     'deleted',    '30'],
    ARRAY['sirhely',           'deleted',    '30'],
    ARRAY['sirhelytemeto',     'deleted',    '30'],
    -- a befizetes a sirhelyberles UTÁN (FK: sirhelyberles.befizetesid → befizetes)
    -- P4-26 (Endre döntése): a pénzügyi bizonylat-sorok 5 ÉVIG maradnak a Kukában.
    ARRAY['befizetes',         'deleted',    '1825'],
    ARRAY['kiadas',            'deleted',    '1825'],
    ARRAY['belsomozgas',       'deleted',    '1825'],
    ARRAY['munkanaplo',        'deleted',    '30'],
    -- ⚠️ a leltar_tetelek jelzője `is_deleted`, NEM `deleted`
    ARRAY['leltar_tetelek',    'is_deleted', '30']
    -- Ha új soft-delete tábla jön: ide ÉS a 2026-08-14-kuka-deleted-at.sql
    -- 2) szakaszának tervébe (deleted_at oszlop + bélyegző trigger) is fel kell venni!
  ];
  sor      text[];
  v_tabla  text;
  v_jelzo  text;
  v_napok  int;
  v_id     record;
  v_szuro  text;   -- 2026-08-17 (S5a, 13. csapda): a scope-szűrő, táblánként
BEGIN
  FOREACH sor SLICE 1 IN ARRAY terv LOOP
    v_tabla := sor[1]; v_jelzo := sor[2]; v_napok := sor[3]::int;
    tbl := v_tabla; deleted_count := 0; skipped_count := 0;

    -- FAIL-CLOSED: érvénytelen megőrzési idő → hangos leállás, nem 0 napos törlés.
    IF v_napok IS NULL OR v_napok < 1 THEN
      RAISE EXCEPTION 'purge_recycle_bin: a(z) % megőrzési ideje érvénytelen (%) — fail-closed leállás.', v_tabla, v_napok;
    END IF;

    -- 2026-08-17 (egyházkerületi S5a, 13. csapda): CSAK a GYÜLEKEZETI sorokat
    -- takarítjuk. A megyei (diocese_id) és a kerületi (district_id) sorokhoz
    -- nincs Kuka-felület, tehát a megőrzési ablak alatt SENKI nem tudná
    -- visszaállítani őket — a hard-delete ott végleges adatvesztés volna.
    SELECT CASE WHEN EXISTS (
             SELECT 1 FROM information_schema.columns c
             WHERE c.table_schema = 'public'
               AND c.table_name::text = v_tabla
               AND c.column_name = 'congregation_id')
           THEN ' AND congregation_id IS NOT NULL'
           ELSE '' END
      INTO v_szuro;
    IF v_szuro IS NULL THEN
      RAISE EXCEPTION 'purge_recycle_bin: a(z) % scope-szűrője NULL lett — fail-closed leállás (szűretlen törlés helyett).', v_tabla;
    END IF;

    BEGIN
      -- Gyors út: egyetlen tömeges DELETE.
      EXECUTE format(
        'DELETE FROM public.%I WHERE %I = true AND deleted_at IS NOT NULL AND deleted_at < now() - make_interval(days => %s)%s',
        v_tabla, v_jelzo, v_napok, v_szuro);
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
      -- Tartalék út: SORONKÉNT — ami törölhető, törlődjön; a védett sor
      -- kimarad és számoljuk.
      BEGIN
        deleted_count := 0;
        FOR v_id IN EXECUTE format(
          'SELECT id FROM public.%I WHERE %I = true AND deleted_at IS NOT NULL AND deleted_at < now() - make_interval(days => %s)%s',
          v_tabla, v_jelzo, v_napok, v_szuro)
        LOOP
          BEGIN
            EXECUTE format('DELETE FROM public.%I WHERE id = $1', v_tabla) USING v_id.id;
            deleted_count := deleted_count + 1;
          EXCEPTION WHEN OTHERS THEN
            skipped_count := skipped_count + 1;
          END;
        END LOOP;
        IF skipped_count > 0 THEN
          RAISE WARNING 'purge_recycle_bin: a(z) % táblában % sor törlését hivatkozás védi — kimaradtak.', v_tabla, skipped_count;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'purge_recycle_bin: a(z) % tábla takarítása sikertelen: %', v_tabla, SQLERRM;
        deleted_count := -1;
      END;
    END;
    -- MINDEN tábla megjelenik az eredményben (hibánál deleted_count = -1).
    RETURN NEXT;
  END LOOP;

  -- P4-26: a változásnapló 5 éves takarítása (Endre döntése: „öt év után
  -- törlődnek"). Best-effort — hibája nem akasztja a Kuka-takarítást.
  BEGIN
    DELETE FROM public.penzugy_valtozas_naplo
      WHERE letrejott < now() - interval '5 years';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    tbl := 'penzugy_valtozas_naplo'; skipped_count := 0;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'purge_recycle_bin: a változásnapló takarítása sikertelen: %', SQLERRM;
  END;
END;
$purge$;

COMMENT ON FUNCTION public.purge_recycle_bin() IS
  '2026-08-29 (P4-26, Endre döntése). Törzs: a 2026-08-17-S5a változat betűhűen, '
  '+ táblánkénti megőrzési idő: a pénzügyi táblák (befizetes/kiadas/belsomozgas) '
  '1825 nap (5 év), minden más 30 nap; + a penzugy_valtozas_naplo 5 éves takarítása. '
  'Gyerek-először sorrend, deleted_at-alapú FAIL-CLOSED feltétel, soronkénti '
  'tartalék-ág az FK-védett sorokra, hibás tábla deleted_count = -1, csak '
  'congregation_id IS NOT NULL sorok.';

-- ── ÖNELLENŐRZÉS (egyetlen rács) ────────────────────────────────────────────
SELECT * FROM (
  SELECT 1 AS sorrend, 'penzugy_valtozas_naplo tábla' AS ellenorzes,
    CASE WHEN to_regclass('public.penzugy_valtozas_naplo') IS NOT NULL
      THEN '✅ létezik' ELSE '❌ HIÁNYZIK' END AS allapot
  UNION ALL
  SELECT 2, 'napló-triggerek (3 tábla × UPDATE+DELETE)',
    CASE WHEN (
      SELECT COUNT(*) FROM pg_trigger
      WHERE tgname LIKE 'trg_pvn_%' AND NOT tgisinternal
    ) = 6 THEN '✅ mind a 6 áll' ELSE '❌ HIÁNYOS: ' || (
      SELECT COUNT(*)::text FROM pg_trigger
      WHERE tgname LIKE 'trg_pvn_%' AND NOT tgisinternal
    ) || '/6' END
  UNION ALL
  SELECT 3, 'purge: pénzügy 5 év',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc
      WHERE proname = 'purge_recycle_bin'
        AND pronamespace = 'public'::regnamespace
        AND prosrc LIKE '%1825%'
    ) THEN '✅ él (1825 nap a pénzügyi táblákon)' ELSE '❌ HIÁNYZIK' END
  UNION ALL
  SELECT 4, 'napló RLS + append-only',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'penzugy_valtozas_naplo'
        AND policyname = 'pvn_admin_select'
    ) AND NOT has_table_privilege('authenticated', 'public.penzugy_valtozas_naplo', 'INSERT')
    THEN '✅ admin-olvasás, kliens-írás tiltva' ELSE '❌ ELLENŐRIZD' END
) x ORDER BY sorrend;
