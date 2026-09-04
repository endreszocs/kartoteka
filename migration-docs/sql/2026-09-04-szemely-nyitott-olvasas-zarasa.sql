-- ═══════════════════════════════════════════════════════════════════════════
--  P0 — A `szemely` TÁBLA NYITOTT OLVASÁSÁNAK ZÁRÁSA
--  2026-09-04 — Futtatja: Endre (Supabase SQL editor), EGYBEN
--
--  ⛔ A HIBA (2026-09-04-i élő méréssel igazolva):
--     A `szemely` táblán ott ül ez a szabály, PERMISSIVE-ként, a `public`
--     szerepre:
--         Mindenki lathatja a szemelyeket [SELECT] USING (auth.role() = 'authenticated')
--
--     A PostgreSQL a PERMISSIVE policy-kat VAGY-kapcsolatban értékeli. Ez tehát
--     FELÜLÍRJA a szűk `szemely_staff_select`-et: MINDEN bejelentkezett fiók —
--     bármelyik gyülekezetből, akár még jóvá nem hagyott állapotban is —
--     elolvashatja az ÖSSZES gyülekezet teljes névsorát: nevek, születési dátum,
--     lakcím, CNP, szülők. 661 személy ebben a gyülekezetben, országosan sok ezer.
--
--     Ugyanaz a hibaosztály, mint a 2026-09-03-án zárt `congregations_select
--     USING(true)`: egy fejlesztés-kori „hadd lássa mindenki" szabály bentmaradt.
--
--  ✅ A JAVÍTÁS: a szabály ELDOBÁSA. Nem szűkítjük, nem írjuk át — TÖRÖLJÜK.
--     A helyes hozzáférést a MÁR MEGLÉVŐ szabályok adják, változatlanul:
--       · szemely_staff_select      → current_user_can_access_congregation(...)
--       · szemely_szint_select-ek   → felettes szintek (esperes, kerület)
--       · szemely_cross_match_select→ a kereszt-egyeztetés szűk ablaka
--       · admin_read_all_szemely    → rendszergazda
--     Vagyis a törléssel SENKI nem veszít olyan hozzáférést, amire jogosult.
--
--  ⚠️ MIÉRT NEM VESZÉLYES: a törlés után is marad 4 olvasási út. Ha bármelyik
--     felület mégis üres listát adna, az azt jelenti, hogy AZ A FELÜLET eddig a
--     nyitott szabályból élt — vagyis olyan adatot mutatott, amit nem lett volna
--     szabad. Ilyenkor NE ezt a szabályt hozd vissza: a hatókört kell javítani.
--
--  VISSZAÁLLÍTÁS (ha mégis kell — de gondold végig a fentit):
--     CREATE POLICY "Mindenki lathatja a szemelyeket" ON public.szemely
--       FOR SELECT USING (auth.role() = 'authenticated');
--
--  FUTTATÁS: egyben, jelölés nélkül. Újrafuttatható (idempotens).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) ELŐFELTÉTEL-KAPU ────────────────────────────────────────────────────
-- Csak akkor dobunk, ha a HELYETTESÍTŐ szabályok tényleg ott vannak. E nélkül
-- a törlés kizárhatná a lelkészt a saját tagjaiból.
DO $$
DECLARE
  v_staff int;
  v_fn    int;
BEGIN
  SELECT count(*) INTO v_staff
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'szemely'
    AND policyname = 'szemely_staff_select';

  SELECT count(*) INTO v_fn
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'current_user_can_access_congregation';

  IF v_staff = 0 THEN
    RAISE EXCEPTION 'MEGÁLLÍTVA: nincs `szemely_staff_select` policy — a nyitott szabály törlése kizárná a lelkészt a saját tagjaiból.';
  END IF;
  IF v_fn = 0 THEN
    RAISE EXCEPTION 'MEGÁLLÍTVA: nincs `current_user_can_access_congregation()` függvény — a szűk policy nem lenne kiértékelhető.';
  END IF;
END $$;

-- ── 2) A NYITOTT SZABÁLY ELDOBÁSA ─────────────────────────────────────────
DROP POLICY IF EXISTS "Mindenki lathatja a szemelyeket" ON public.szemely;

COMMIT;

-- ── 3) ELLENŐRZÉS — EGY RÁCS ──────────────────────────────────────────────
-- (A Supabase editor csak az UTOLSÓ rácsot mutatja; ezért EGY lekérdezés.)
WITH allapot AS (
  SELECT
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'szemely'
        AND policyname = 'Mindenki lathatja a szemelyeket'
    ) THEN '⛔ MÉG MEGVAN — a törlés nem futott le' ELSE '✅ TÖRÖLVE' END AS a,
    (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'szemely' AND cmd IN ('SELECT','ALL')
        AND permissive = 'PERMISSIVE') AS b
)
SELECT '1 · a nyitott szabály' AS kulcs, a AS ertek FROM allapot
UNION ALL
SELECT '2 · maradó olvasási utak (permissive SELECT/ALL)', b::text FROM allapot
UNION ALL
SELECT '3 · ' || policyname, left(COALESCE(qual, '—'), 80)
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'szemely' AND cmd IN ('SELECT','ALL')
ORDER BY 1;
