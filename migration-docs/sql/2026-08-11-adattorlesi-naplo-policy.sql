-- KARTOTEKA — Az adattörlési napló olvasási szabályának szigorítása (2026-08-11)
-- Futtatja: Endre (Supabase SQL Editor). Egyben futtatható, idempotens.
--
-- ════════════════════════════════════════════════════════════════════════════
-- MI A BAJ
-- ════════════════════════════════════════════════════════════════════════════
-- A `data_wipe_log` tábla azt őrzi, hogy MIKOR, KI, MELYIK gyülekezetben,
-- HÁNY sort törölt véglegesen. Ez a rendszer legérzékenyebb üzemeltetési
-- naplója.
--
-- A 2026-04-24-es policy (2026-04-24-admin-wipe-congregation-data.sql:55-67)
-- ennyit követelt meg az olvasáshoz:
--       role IN ('admin', 'master', 'egyhazkeruleti_admin')
-- KÉT dolog hiányzott belőle:
--   1) NINCS `status = 'active'` feltétel → egy felfüggesztett, de még 'admin'
--      szerepű profil is olvashatta;
--   2) NINCS kerület-feltétel → BÁRMELY egyházkerületi admin végigolvashatta
--      az ORSZÁG ÖSSZES adattörlését, nem csak a saját kerületéét.
--
-- A 2. pont szembemegy a kimondott hatókör-elvvel („más kerületet NE is
-- lásson", lib/auth/admin-scope.ts fejléc), és pont az a fajta
-- üzemeltetési információ, amiből egy kívülálló feltérképezheti, hol
-- történtek adatvesztések.
--
-- ════════════════════════════════════════════════════════════════════════════
-- MI TÖRTÉNT MÁR (alkalmazás-oldal)
-- ════════════════════════════════════════════════════════════════════════════
-- A `listRecentWipesAction` (apps/web/app/(dashboard)/admin/wipe-actions.ts)
-- MA MÁR hívja a `requireAdminAccess`-t és hatókörre szűri az eredményt.
-- Ez a fájl a MÁSIK felet, az adatbázis-oldali védvonalat pótolja: a policy
-- addig a gyengébb réteg marad, amíg ez nem fut le.
--
-- Fontos: az olvasás joga NEM azonos a törlés jogával. A kerületi admin
-- ezután LÁTJA a saját kerülete törléseit, de törlést továbbra sem indíthat
-- (azt az alkalmazás `allowDistrictAdmin: false` kapuja zárja).

BEGIN;

DROP POLICY IF EXISTS data_wipe_log_admin_read ON public.data_wipe_log;

CREATE POLICY data_wipe_log_admin_read ON public.data_wipe_log
  FOR SELECT
  USING (
    -- ── 1) Rendszergazda / master: korlátlan, de KIZÁRÓLAG aktív profillal ──
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND p.role IN ('admin', 'master')
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid()
        AND pr.scope = 'system'
        AND pr.role = 'admin'
        AND pr.active = true
        AND pr.approval_status = 'approved'
    )

    -- ── 2) Egyházkerületi admin: CSAK a saját kerülete gyülekezetei ─────────
    -- A hatókör két forrása — az alkalmazás `getAdminDistrictScope`-jával
    -- azonosan: elsődlegesen a `profile_roles` district-scope sorai, illetve
    -- a `profiles.district_id` skalár. A gyülekezet → egyházmegye → kerület
    -- láncot a VALÓDI kapcsolaton oldjuk fel (congregations.diocese_id →
    -- dioceses.district_id), nem egy tárolt, elévülhető oszlopon.
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.congregations c ON c.id = data_wipe_log.congregation_id
      JOIN public.dioceses      d ON d.id = c.diocese_id
      WHERE p.id = auth.uid()
        AND p.status = 'active'
        AND d.district_id IS NOT NULL
        AND (
          (p.role = 'egyhazkeruleti_admin' AND d.district_id = p.district_id)
          OR EXISTS (
            SELECT 1 FROM public.profile_roles pr
            WHERE pr.profile_id = p.id
              AND pr.scope = 'district'
              AND pr.scope_id = d.district_id
              AND pr.active = true
              AND pr.approval_status = 'approved'
          )
        )
    )
  );

COMMENT ON POLICY data_wipe_log_admin_read ON public.data_wipe_log IS
  '2026-08-11 (5. kör, P3 #6): adattörlési napló olvasása. Rendszergazda/master korlátlanul (csak AKTÍV profillal), egyházkerületi admin KIZÁRÓLAG a saját kerülete gyülekezeteire. Az előző verzió sem status-, sem kerület-feltételt nem tartalmazott, így bármely kerületi admin az ORSZÁG összes törlését olvashatta.';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS — EGYETLEN SELECT ===
-- (A Supabase SQL Editor csak az UTOLSÓ eredményt mutatja, ezért egyben.)
-- ════════════════════════════════════════════════════════════════════════════

SELECT x.sorrend, x.mit_mer, x.ertek, x.vart,
       CASE WHEN x.ertek = x.vart THEN '✅' ELSE '❌' END AS rendben
FROM (
  SELECT 1 AS sorrend,
         'A policy letezik'::text AS mit_mer,
         EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'data_wipe_log'
                   AND policyname = 'data_wipe_log_admin_read')::text AS ertek,
         'true'::text AS vart

  UNION ALL SELECT 2, 'Tartalmazza a status-feltetelt',
         COALESCE((SELECT (qual LIKE '%status%')::text FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = 'data_wipe_log'
                     AND policyname = 'data_wipe_log_admin_read'), 'nincs policy'), 'true'

  UNION ALL SELECT 3, 'Tartalmazza a kerulet-feltetelt (district_id)',
         COALESCE((SELECT (qual LIKE '%district_id%')::text FROM pg_policies
                   WHERE schemaname = 'public' AND tablename = 'data_wipe_log'
                     AND policyname = 'data_wipe_log_admin_read'), 'nincs policy'), 'true'

  UNION ALL SELECT 4, 'RLS BE van kapcsolva a tablan',
         COALESCE((SELECT c.relrowsecurity::text FROM pg_class c
                   JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE n.nspname = 'public' AND c.relname = 'data_wipe_log'), 'nincs tabla'), 'true'

  UNION ALL SELECT 5, 'Nincs masik, tagabb SELECT-policy a tablan',
         (SELECT count(*)::text FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'data_wipe_log'
            AND cmd = 'SELECT'
            AND policyname <> 'data_wipe_log_admin_read'), '0'
) x
ORDER BY x.sorrend;

-- ════════════════════════════════════════════════════════════════════════════
-- FÜST-TESZT (a futtatás után, az alkalmazásban)
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Rendszergazdaként: /admin → Adattörlés panel → a törlési előzmény
--    TOVÁBBRA IS minden gyülekezetet mutat.
-- 2. Egyházkerületi adminként: ugyanott CSAK a saját kerülete gyülekezetei
--    jelennek meg, és a törlés indítása továbbra is TILTOTT.
-- 3. Ha az 5. ellenőrző sor nem 0-t adott: küldd vissza az eredményt — egy
--    tágabb PERMISSIVE policy VAGY-olódna ezzel, és hatástalanítaná.
