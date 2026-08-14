-- ═══════════════════════════════════════════════════════════════════════════
--  SZÁMADÁS-ZÁR A TÖRLÉSRE IS — RLS-védőháló (2026-08-15, átvilágítás ⛔1)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  MI VOLT A HIBA (kód-igazolt, 2026-08-15-i átvilágítás 1. kritikus pontja):
--  a `deleted = true` (soft delete) volt az EGYETLEN pénzügyi írási út, amely
--  nem olvasta a `bealitas.accounting_finalized` zászlót. A rögzítés
--  (year-lock.ts), a szerkesztés (update-transaction.ts) és a stornó
--  (storno.ts, edit-storno-actions.ts) mind fail-closed zár — a törlés nem.
--  Következmény: egy már VÉGLEGESÍTETT, aláírt és az egyházmegyének BEKÜLDÖTT
--  év tétele egyetlen kattintással eltüntethető volt. A kassza- és
--  bankegyenleg, a Registru, a Csoportnapló és a Számadás tény-oszlopa azonnal
--  elmozdult, a beküldött papír viszont változatlan maradt — hibaüzenet nélkül.
--
--  AZ APP-OLDALI JAVÍTÁS MÁR MEGVAN (ugyanezen a napon):
--   · apps/web/app/(dashboard)/penzugy/actions.ts → deleteTransaction
--   · packages/core/src/finance/{befizetes,kiadas,belsomozgas}/soft-delete.ts
--  Ez a fájl a MÉLYSÉGI VÉDELEM: az igazi zár az adatbázisban van, hogy egy
--  régi desktop-kliens, egy nyers PostgREST-hívás vagy egy jövőbeli új írási
--  út se tudja megkerülni. Ugyanaz a minta, mint a
--  `2026-07-10-koltsegvetes-zar-rls.sql`-é.
--
--  ── MIT ZÁR PONTOSAN (és mit NEM) ─────────────────────────────────────────
--  A policy CSAK azt tiltja, hogy egy UPDATE eredményeként a sor `deleted`
--  jelzője IGAZ legyen egy zárt év tételén. SZÁNDÉKOSAN nem tiltja:
--   · a visszaállítást (`deleted` → false): a Kuka „visszaállítás" gombja
--     zárt évben is működik — az kifelé, a helyreállítás irányába mozdít;
--   · a többi oszlop szerkesztését: azt az app-réteg zárja (szerkesztés/
--     stornó), és nem akartunk RLS-szinten olyan széles kaput csukni, amiről
--     nem tudjuk végigmérni, mit tör el (pl. a véglegesítés saját folyamatát);
--   · a `service_role`-t és a SECURITY DEFINER karbantartó RPC-ket (a policy
--     `TO authenticated`, a mentés/purge/import ezekre nem fut).
--  ISMERT SZŰKÍTÉS: ha egy MÁR törölt sort (deleted = true) valaki zárt évben
--  újra UPDATE-elne (pl. tömeges `updated_at`-érintés), az elbukik. Ez tudatos:
--  ilyen legitim művelet nincs a kódban, a takarítás pedig DELETE-tel dolgozik.
--
--  ── ⚠️ MAI TANULSÁG (a 2026-08-15-mfa-rls-HOTFIX.sql-ből) ─────────────────
--  Ha egy policy MÁS SÉMÁBÓL olvas (pl. `auth`), a lekérdező `authenticated`
--  szerepnek GRANT kell rá, különben a policy kiértékelése SQL-hibára fut, a
--  PostgREST MINDEN kérésre 403-at ad, és az app leáll. EZ A POLICY EZÉRT
--  KIZÁRÓLAG A `public` SÉMÁBÓL OLVAS (`public.bealitas`), ráadásul SECURITY
--  DEFINER függvényen keresztül — cross-séma GRANT tehát nem kell. A
--  függvényre az EXECUTE jogot mégis KIFEJEZETTEN megadjuk (lentebb), hogy egy
--  szigorúbb alapértelmezett jogosultság-beállítás se némítsa el.
--
--  ⚠️ EGY TRANZAKCIÓ — vagy minden lépés lefut, vagy semmi.
--  Újrafuttatható (CREATE OR REPLACE / DROP POLICY IF EXISTS + CREATE).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) Segédfüggvény: zárt-e a tétel dátumához tartozó év számadása? ──────
--
-- SECURITY DEFINER, hogy a `bealitas` olvasása NE függjön a hívó saját
-- bealitas-RLS-étől (különben egy szűkebb jogú fiók „nem zárt"-nak látná a
-- zárt évet — pont a fail-open csapda).
--
-- A paraméter `timestamp`, mert a `datum` oszlop típusa táblánként eltér:
--   befizetes.datum   = date
--   kiadas.datum      = timestamp without time zone
--   belsomozgas.datum = date
-- A policyk explicit `datum::timestamp` alakban hívják, így nincs
-- függvény-feloldási kétértelműség.
--
-- NULL-SZEMANTIKA: ha a `congregation_id` vagy a `datum` NULL (legacy, árva
-- sor), a lekérdezés nem ad sort → `false` = „nincs zárva". Ez tudatos: a
-- zárás gyülekezet+év kulcsra épül, aminek egyik fele nélkül nincs mit zárni.
CREATE OR REPLACE FUNCTION public.is_szamadas_zarva(
  p_congregation_id uuid,
  p_datum timestamp
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT b.accounting_finalized
      FROM public.bealitas b
      WHERE b.congregation_id = p_congregation_id
        AND b.id = to_char(p_datum, 'YYYY')
      LIMIT 1
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.is_szamadas_zarva(uuid, timestamp) IS
  '2026-08-15 (átvilágítás ⛔1): true, ha a tétel dátumához tartozó évi '
  'számadás véglegesítve van (bealitas.accounting_finalized). A soft-delete '
  'zár RLS-policyi hívják.';

-- A policy a lekérdező szerep nevében értékelődik ki → EXECUTE jog kell rá.
GRANT EXECUTE ON FUNCTION public.is_szamadas_zarva(uuid, timestamp)
  TO authenticated, service_role;

-- ─── 2) RESTRICTIVE policy: zárt évben a `deleted` nem billenthető igazra ──
-- RESTRICTIVE = a meglévő permissive policykkal ÉS-kapcsolatban szűkít, tehát
-- semmit nem NYIT — csak tovább zár.
--
-- Védekező DO-blokk („a migration-fájl nem bizonyíték"): ha egy tábla vagy
-- valamelyik szükséges oszlopa hiányzik az ÉLŐ sémából, HANGOS figyelmeztetéssel
-- kihagyjuk, és a záró ellenőrző lekérdezés ❌-szel mutatja meg.
DO $$
DECLARE
  tablak text[] := ARRAY['befizetes', 'kiadas', 'belsomozgas'];
  t text;
  hianyzo text;
BEGIN
  FOREACH t IN ARRAY tablak LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE WARNING 'szamadas-zar-torles-rls: a(z) % tábla NEM LÉTEZIK — kihagyva', t;
      CONTINUE;
    END IF;

    SELECT string_agg(sz.oszlop, ', ')
      INTO hianyzo
      FROM unnest(ARRAY['deleted', 'datum', 'congregation_id']) AS sz(oszlop)
     WHERE NOT EXISTS (
       SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = t
          AND c.column_name = sz.oszlop
     );

    IF hianyzo IS NOT NULL THEN
      RAISE WARNING 'szamadas-zar-torles-rls: a(z) % táblából hiányzik: % — kihagyva', t, hianyzo;
      CONTINUE;
    END IF;

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      t || '_nincs_torles_zart_evben', t
    );
    -- USING (true): a RÉGI sorra nem szűkítünk (a szerkesztést az app-réteg
    -- zárja). A tiltás az ÚJ soron van: zárt évben nem lehet `deleted` igaz.
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated '
      'USING (true) '
      'WITH CHECK (deleted IS NOT TRUE '
      '            OR NOT public.is_szamadas_zarva(congregation_id, datum::timestamp))',
      t || '_nincs_torles_zart_evben', t
    );

    EXECUTE format(
      'COMMENT ON POLICY %I ON public.%I IS %L',
      t || '_nincs_torles_zart_evben', t,
      '2026-08-15 (átvilágítás ⛔1): véglegesített (accounting_finalized) évben a '
      'sor nem jelölhető töröltnek. A visszaállítás (deleted -> false) megengedett.'
    );

    RAISE NOTICE 'szamadas-zar-torles-rls: % ✅ policy létrehozva', t;
  END LOOP;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
--  ELLENŐRZÉS (csak olvas — futtasd a COMMIT után)
-- ═══════════════════════════════════════════════════════════════════════════
--  Mindhárom sorban ✅-t kell látni.
SELECT
  t.tabla,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND p.tablename = t.tabla
       AND p.policyname = t.tabla || '_nincs_torles_zart_evben'
       AND p.permissive = 'RESTRICTIVE'
       AND p.cmd = 'UPDATE'
  ) THEN '✅' ELSE '❌ HIÁNYZIK' END AS policy_all,
  CASE WHEN has_function_privilege(
         'authenticated', 'public.is_szamadas_zarva(uuid, timestamp)', 'EXECUTE')
       THEN '✅' ELSE '❌ NINCS EXECUTE JOG' END AS fuggveny_jog
FROM (VALUES ('befizetes'), ('kiadas'), ('belsomozgas')) AS t(tabla);

-- Funkcionális próba EGY TESZT-gyülekezeten (Barátosi: 7e57…0003), bejelentkezett
-- (authenticated) kliensről — NE a service_role kulccsal, az szándékosan mentes:
--   UPDATE bealitas SET accounting_finalized = true
--     WHERE congregation_id = '<teszt-cong-uuid>' AND id = '2026';
--   -- ezután a felületről egy 2026-os tétel törlése magyar hibaüzenettel áll meg,
--   -- nyers PostgREST-hívásból pedig:
--   --   "new row violates row-level security policy for table \"befizetes\""
--   UPDATE bealitas SET accounting_finalized = false
--     WHERE congregation_id = '<teszt-cong-uuid>' AND id = '2026';
--   -- → a törlés újra működik (feloldás után szerkeszthető marad az év).

-- ═══════════════════════════════════════════════════════════════════════════
--  VÉSZ-VISSZAVONÁS — CSAK ha a bevezetés után váratlan hiba jelentkezik.
--  Jelöld ki és futtasd az alábbi blokkot (a policyk lekerülnek, minden
--  visszaáll a mai állapotra; az app-oldali zár akkor is véd):
--
--  DO $$ DECLARE t text; BEGIN
--    FOREACH t IN ARRAY ARRAY['befizetes','kiadas','belsomozgas']
--    LOOP
--      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
--                     t || '_nincs_torles_zart_evben', t);
--    END LOOP;
--  END $$;
--  DROP FUNCTION IF EXISTS public.is_szamadas_zarva(uuid, timestamp);
-- ═══════════════════════════════════════════════════════════════════════════
