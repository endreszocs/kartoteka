-- ═══════════════════════════════════════════════════════════════════════════
--  „Mindenki lathatja a szemelyeket" — A SZIVÁRGÁS MEGERŐSÍTÉSE (CSAK OLVAS)
--  2026-09-04 — Futtatja: Endre (Supabase Studio SQL Editor)
--
--  MIÉRT: az állapotfelmérés kimutatta, hogy a `szemely` táblán ott ül ez a
--  policy:
--      Mindenki lathatja a szemelyeket [SELECT] USING (auth.role() = 'authenticated')
--
--  HA ez PERMISSIVE (a Postgres alapértelmezése), akkor a policy-k VAGY-kapcsolatban
--  állnak, tehát ez a szabály FELÜLÍRJA a szűk `szemely_staff_select`-et: minden
--  bejelentkezett felhasználó — bármelyik gyülekezetből, akár még jóvá nem hagyott
--  fiókkal — elolvashatja az ÖSSZES gyülekezet teljes névsorát (név, születési
--  dátum, cím, CNP, szülők).
--
--  HA RESTRICTIVE, akkor ÉS-kapcsolatban áll, és nem szivárog. Ez a lekérdezés
--  ezt dönti el — és nem találgat: a `permissive` oszlopot olvassa ki.
--
--  SEMMIT NEM MÓDOSÍT. Jelölés nélkül nyomj Run-t. Egy rács.
-- ═══════════════════════════════════════════════════════════════════════════

WITH
-- ── 1) A DÖNTŐ KÉRDÉS: permissive vagy restrictive? ────────────────────────
verdikt AS (
  SELECT
    '1 · ➡️ VERDIKT' AS szakasz,
    'szivárog-e a szemely tábla minden bejelentkezett felhasználónak?' AS kulcs,
    CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'szemely'
          AND policyname = 'Mindenki lathatja a szemelyeket'
      ) THEN '✅ a policy MÁR NINCS MEG — nincs teendő'
      WHEN EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'szemely'
          AND policyname = 'Mindenki lathatja a szemelyeket'
          AND permissive = 'PERMISSIVE'
      ) THEN '⛔ IGEN — PERMISSIVE, tehát VAGY-ban áll a szűk szabállyal: MINDEN bejelentkezett fiók olvassa az ÖSSZES gyülekezet névsorát'
      ELSE '✅ RESTRICTIVE — ÉS-ben áll, nem szivárog (de akkor is fölösleges)'
    END AS ertek
),
-- ── 2) A szemely ÖSSZES policy-ja, permissive-jelöléssel ───────────────────
szemely_policyk AS (
  SELECT
    '2 · szemely policy-k' AS szakasz,
    policyname || '  [' || cmd || ']' AS kulcs,
    CASE permissive WHEN 'PERMISSIVE' THEN '🔓 PERMISSIVE (VAGY)' ELSE '🔒 RESTRICTIVE (ÉS)' END
      || ' · szerepek: ' || array_to_string(roles, ', ')
      || ' · USING: ' || left(COALESCE(qual, '—'), 90) AS ertek
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'szemely'
),
-- ── 3) Ugyanez az anyakönyvi és család-táblákon (van-e máshol is ilyen) ────
mas_tablak AS (
  SELECT
    '3 · más táblák — nyitott SELECT?' AS szakasz,
    tablename || ' :: ' || policyname AS kulcs,
    CASE permissive WHEN 'PERMISSIVE' THEN '🔓 PERMISSIVE' ELSE '🔒 RESTRICTIVE' END
      || ' · USING: ' || left(COALESCE(qual, '—'), 90) AS ertek
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('keresztseg','konfirmalas','hazassag','temetes','bekoltozott',
                      'elkoltozott','attert','kitert','csalad','gyerek','haztartas',
                      'haztartas_tag','szemely_kapcsolat','member_transfer_notifications')
    AND cmd IN ('SELECT','ALL')
    -- Csak a GYANÚS, hatókör nélküli szabályok: amelyek nem hivatkoznak
    -- gyülekezet-azonosítóra és nem az MFA-kapu.
    AND policyname <> 'mfa_opt_in_aal2'
    AND COALESCE(qual, '') NOT ILIKE '%congregation%'
    AND COALESCE(qual, '') NOT ILIKE '%accessible_cong%'
    AND COALESCE(qual, '') NOT ILIKE '%felettes_szint%'
),
-- ── 4) A policy-kban hívott segédfüggvények LÉTEZNEK-e? ────────────────────
--     (Egy hiányzó függvény a policy KIÉRTÉKELÉSÉT dobja el → 403 vagy üres lista.)
segedek AS (
  SELECT
    '4 · policy-segédfüggvények' AS szakasz,
    f AS kulcs,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = f
    ) THEN '✅ létezik' ELSE '⛔ HIÁNYZIK — a rá épülő policy nem értékelhető ki' END AS ertek
  FROM unnest(ARRAY[
    'current_user_congregation_id',
    'current_user_can_access_congregation',
    'current_user_has_global_access',
    'felettes_szint_gyulekezet_ids',
    'szemely_kereszt_egyezesben_lathato',
    'csalad_resolves_to_accessible_cong',
    'gyerek_resolves_to_accessible_cong'
  ]) AS f
),
-- ── 5) Az anyakönyvi táblák audit-triggere — MEGERŐSÍTÉS ──────────────────
audit_kapu AS (
  SELECT
    '5 · anyakönyvi audit-trigger' AS szakasz,
    t AS kulcs,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t
        AND NOT tg.tgisinternal AND tg.tgname ILIKE '%audit%'
    ) THEN '✅ van audit-trigger'
    ELSE '⛔ NINCS — a bejegyzés átírható/törölhető NYOM NÉLKÜL'
    END AS ertek
  FROM unnest(ARRAY['keresztseg','konfirmalas','hazassag','temetes',
                    'bekoltozott','elkoltozott','attert','kitert']) AS t
)
SELECT * FROM verdikt
UNION ALL SELECT * FROM szemely_policyk
UNION ALL SELECT * FROM mas_tablak
UNION ALL SELECT * FROM segedek
UNION ALL SELECT * FROM audit_kapu
ORDER BY 1, 2;
