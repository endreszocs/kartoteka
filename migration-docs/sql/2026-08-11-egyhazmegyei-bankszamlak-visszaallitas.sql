-- KARTOTEKA — Egyházmegyei bankszámlák elérhetőségének helyreállítása (2026-08-11)
-- Futtatja: Endre (Supabase SQL Editor). Egyben futtatható, idempotens.
--
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ EZ EGY MA OKOZOTT REGRESSZIÓ JAVÍTÁSA — ŐSZINTÉN
-- ════════════════════════════════════════════════════════════════════════════
-- A mai (2026-08-11) biztonsági kör szűkítette a `current_user_has_global_access()`
-- függvényt: az esperes és az egyházmegyei admin KIKERÜLT belőle, csak a
-- rendszergazda maradt. Ez a szűkítés helyes és szándékos volt — de volt egy
-- MELLÉKHATÁSA, amit akkor nem vettünk észre:
--
--   A `bankszamlak_access` policy törzse:
--       current_user_can_access_congregation(congregation_id)
--   Az EGYHÁZMEGYEI bankszámla-soron viszont `congregation_id IS NULL`
--   (a 2026-04-18-egyhazmegyei-penzugy-fazis8.sql így hozta létre).
--
--   A szűkített `current_user_can_access_congregation()` NULL bemenetre végig-
--   vezetve MINDEN ága elbukik:
--     (1) globális hozzáférés → 2026-08-11 óta CSAK rendszergazda,
--     (2) saját gyülekezet    → `target_cong IS NOT NULL` kapu,
--     (3) megye/kerület       → `felettes_szint_hozzaferese(NULL)` =
--                               `EXISTS (SELECT 1 FROM congregations WHERE id = NULL)` → hamis,
--     (4)(5)(6)               → mind `target_cong IS NOT NULL` kapuval kezdődik.
--
--   EREDMÉNY: az esperes MA nem látja és nem is tudja létrehozni a saját
--   egyházmegyéje bankszámláit. A szűkítés ELŐTT a globális ágon átment.
--
-- A testvér-tábla (`chitanta_tombok`) 2026-08-09-én megkapta a pótló
-- egyházmegyei policy-t; a `bankszamlak` kimaradt. Ez a fájl pótolja.
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIT CSINÁL — ÉS MIT NEM
-- ════════════════════════════════════════════════════════════════════════════
-- ✅ Hozzáad EGY additív policy-t: az egyházmegyei bankszámla-sorokra
--    (`congregation_id IS NULL AND diocese_id = <a hívó egyházmegyéje>`).
-- ⛔ NEM nyúl a meglévő `bankszamlak_access` policy-hoz — a gyülekezeti
--    hozzáférés bájtra változatlan marad.
-- ⛔ NEM ad hozzáférést más egyházmegye bankszámláihoz.
-- ⛔ NEM állítja vissza a globális hozzáférést (az a mai kör lényege volt).
--
-- Hatókör-feloldás: a mai `current_user_diocese_ids()` függvényre épül, amely
-- KÉTLÁBÚ és fallback-elvű (előbb a `profile_roles` sorok, a `profiles.diocese_id`
-- skalár CSAK akkor, ha nincs szerepkör-sor) — azonosan az alkalmazással.

BEGIN;
SET LOCAL lock_timeout      = '5s';
SET LOCAL statement_timeout = '2min';

-- ── ŐRSZEM: a hatókör-feloldó függvénynek léteznie kell ─────────────────────
DO $orszem$
BEGIN
  IF to_regprocedure('public.current_user_diocese_ids()') IS NULL THEN
    RAISE EXCEPTION '⛔ Hiányzik a current_user_diocese_ids() — előbb a 2026-08-11-globalis-hozzaferes-szukites.sql 1. SZAKASZÁT futtasd.';
  END IF;
  IF to_regclass('public.bankszamlak') IS NULL THEN
    RAISE EXCEPTION '⛔ Nincs public.bankszamlak tábla — nem ez az adatbázis.';
  END IF;
END
$orszem$;

DROP POLICY IF EXISTS bankszamlak_egyhazmegye_access ON public.bankszamlak;

CREATE POLICY bankszamlak_egyhazmegye_access
  ON public.bankszamlak
  FOR ALL
  TO authenticated
  USING (
    bankszamlak.congregation_id IS NULL
    AND bankszamlak.diocese_id IS NOT NULL
    AND bankszamlak.diocese_id = ANY (public.current_user_diocese_ids())
  )
  WITH CHECK (
    bankszamlak.congregation_id IS NULL
    AND bankszamlak.diocese_id IS NOT NULL
    AND bankszamlak.diocese_id = ANY (public.current_user_diocese_ids())
  );

COMMENT ON POLICY bankszamlak_egyhazmegye_access ON public.bankszamlak IS
  '2026-08-11: additív hozzáférés az EGYHÁZMEGYEI bankszámlákhoz (congregation_id IS NULL). A 2026-08-11-i globális szűkítés mellékhatásaként az esperes elvesztette a saját egyházmegyéje banksorait, mert a bankszamlak_access a can_access_congregation(NULL)-ra épül, ami a szűkítés óta csak rendszergazdának ad igent. A gyülekezeti policy VÁLTOZATLAN.';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS — EGYETLEN SELECT ===
-- (A Studio csak az UTOLSÓ eredményt mutatja, ezért minden egybe van fűzve.)
-- ════════════════════════════════════════════════════════════════════════════

SELECT x.sorrend, x.mit_mer, x.ertek, x.vart,
       CASE WHEN x.ertek = x.vart THEN '✅' ELSE '❌' END AS rendben
FROM (
  SELECT 1 AS sorrend, 'Az új egyházmegyei policy létezik'::text AS mit_mer,
         EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'bankszamlak'
                   AND policyname = 'bankszamlak_egyhazmegye_access')::text AS ertek,
         'true'::text AS vart

  UNION ALL SELECT 2, 'A GYÜLEKEZETI policy VÁLTOZATLANUL megvan',
         EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'bankszamlak'
                   AND policyname = 'bankszamlak_access')::text, 'true'

  UNION ALL SELECT 3, 'RLS BE van kapcsolva a bankszamlak táblán',
         COALESCE((SELECT c.relrowsecurity::text FROM pg_class c
                   JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname = 'public' AND c.relname = 'bankszamlak'), 'nincs tabla'), 'true'

  UNION ALL SELECT 4, 'Nem maradt NYITOTT (USING true) policy a táblán',
         (SELECT count(*)::text FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'bankszamlak'
            AND permissive = 'PERMISSIVE' AND 'authenticated' = ANY(roles)
            AND (btrim(COALESCE(qual, '')) = 'true'
                 OR btrim(COALESCE(with_check, '')) = 'true')), '0'

  UNION ALL SELECT 5, 'Hány EGYHÁZMEGYEI bankszámla van ma (tájékoztató)',
         (SELECT count(*)::text FROM public.bankszamlak
          WHERE congregation_id IS NULL AND diocese_id IS NOT NULL),
         (SELECT count(*)::text FROM public.bankszamlak
          WHERE congregation_id IS NULL AND diocese_id IS NOT NULL)

  UNION ALL SELECT 6, 'Árva banksor (sem gyülekezet, sem egyházmegye) — SENKI nem látná',
         (SELECT count(*)::text FROM public.bankszamlak
          WHERE congregation_id IS NULL AND diocese_id IS NULL), '0'
) x
ORDER BY x.sorrend;

-- ════════════════════════════════════════════════════════════════════════════
-- FÜST-TESZT
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Lelkészként: Pénzügy → Bank fül → a saját gyülekezeted bankszámlái
--    VÁLTOZATLANUL látszanak, és új is felvehető. (Ha ez sérült, azonnal szólj.)
-- 2. Esperesként (vagy egyházmegyei adminként): az egyházmegyei pénzügyi
--    felületen a saját egyházmegyéd bankszámlái megjelennek, és új is felvehető.
-- 3. Esperesként: MÁSIK egyházmegye bankszámlája NEM látszik.
-- 4. Ha a 6. ellenőrző sor nem 0: van olyan banksor, amelyhez sem gyülekezet,
--    sem egyházmegye nincs rendelve — azt SENKI nem látja. Küldd vissza az
--    eredményt, és eldöntjük, hova tartozik.
--
-- ════════════════════════════════════════════════════════════════════════════
-- VISSZAVONÁS (ha bármi gond lenne)
-- ════════════════════════════════════════════════════════════════════════════
--   DROP POLICY IF EXISTS bankszamlak_egyhazmegye_access ON public.bankszamlak;
--   NOTIFY pgrst, 'reload schema';
-- (Ezzel a gyülekezeti hozzáférés érintetlen marad — csak az egyházmegyei
--  banksorok válnak megint elérhetetlenné.)
