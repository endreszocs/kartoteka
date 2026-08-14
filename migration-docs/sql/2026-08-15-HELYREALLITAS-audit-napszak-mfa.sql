-- ═══════════════════════════════════════════════════════════════════════════
--  ⛔ HELYREÁLLÍTÁS — három ma keletkezett hiba javítása (2026-08-15)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  A mai átvilágítás három olyan hibát talált, amit A MAI MUNKA okozott.
--  Mindhárom ebben az egy fájlban javul. Futtasd le egyben.
--
--  1. SZAKASZ — ⛔ SÚLYOS, ÉLESBEN AKTÍV BIZTONSÁGI VISSZALÉPÉS.
--     A ma lefuttatott `2026-08-15-audit-ip-useragent.sql` DROP-olta az
--     5 paraméteres `log_audit_event`-et, és az új 7 paraméteres törzsből
--     KIMARADT mind a négy védelem, amit a 2026-08-11-es keményítés tett bele:
--       (a) fail-closed: bejelentkezés nélkül (anon) nincs naplóírás,
--       (b) action / target_table hossz-korlát (120 karakter),
--       (c) metadata méret-korlát (8192 bájt),
--       (d) felhasználónként max. 2000 audit-sor óránként.
--     A DROP-pal ráadásul elveszett a függvényre adott REVOKE is, tehát az
--     alapértelmezett PUBLIC EXECUTE visszaállt. Következmény MOST: bárki, aki
--     el tudja érni az RPC-t, korlátlan mennyiségű, tetszőleges tartalmú sort
--     írhat az audit_log-ba (napló-mérgezés + tárhely-kimerítés).
--     Ez a szakasz visszateszi mind a négy őrt — az ip/user_agent bővítés
--     megmarad.
--
--  2. SZAKASZ — ⛔ A De.2 / Du.2 MUNKANAPLÓ-BEJEGYZÉS NEM MENTHETŐ.
--     A 18. pont bevezette a második délelőtti/délutáni alkalom jelölését
--     ('de2' / 'du2'), a `munkanaplo_napszak_check` viszont 2026-07-11 óta
--     csak 'de' / 'du' / 'este' értéket enged. Aki ma bejelöli a második
--     alkalmat, adatbázis-hibát kap, és a bejegyzés elveszik. Ugyanez a
--     korlát az `igehirdetesi_terv` táblán is — ott is tágítjuk.
--
--  3. SZAKASZ — a `gyerek` tábla kimaradt a 2FA-védelemből.
--     A ma bevezetett opt-in aal2-kényszer 14 táblát véd, de a `gyerek`
--     (kiskorúak adatai) nem került közéjük, pedig a `szemely`-lyel azonos
--     érzékenységű. Pótoljuk.
--
--  ⚠️ Idempotens, újrafuttatható. A végén ellenőrző lekérdezés.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. SZAKASZ — a naplófüggvény keményítésének visszaállítása (ip/user_agent-tel)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action TEXT,
  p_target_table TEXT DEFAULT NULL,
  p_target_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_device_id UUID DEFAULT NULL,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $audit$
DECLARE
  v_caller UUID := auth.uid();
  v_recent INTEGER;
  v_id UUID;
  v_ip INET;
BEGIN
  -- (1) Fail-closed: bejelentkezés nélkül (anon) NINCS naplóírás.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Nincs bejelentkezett felhasználó — audit-esemény nem naplózható.';
  END IF;

  -- (2) Alap-validáció: az action kötelező és rövid.
  IF p_action IS NULL OR btrim(p_action) = '' THEN
    RAISE EXCEPTION 'Az audit-esemény action mezője kötelező.';
  END IF;

  IF length(p_action) > 120 THEN
    RAISE EXCEPTION 'Túl hosszú audit action (% karakter, max. 120).', length(p_action);
  END IF;

  IF p_target_table IS NOT NULL AND length(p_target_table) > 120 THEN
    RAISE EXCEPTION 'Túl hosszú audit target_table (% karakter, max. 120).', length(p_target_table);
  END IF;

  -- (3) Méret-korlát a metadata-ra (tárhely-kimerítés ellen).
  IF p_metadata IS NOT NULL AND length(p_metadata::text) > 8192 THEN
    RAISE EXCEPTION 'Túl nagy audit metadata (% bájt, max. 8192).', length(p_metadata::text);
  END IF;

  -- (4) Mennyiség-korlát: felhasználónként max. 2000 audit-sor / óra.
  SELECT COUNT(*) INTO v_recent
  FROM public.audit_log a
  WHERE a.user_id = v_caller
    AND a.created_at > now() - interval '1 hour';

  IF v_recent >= 2000 THEN
    RAISE WARNING 'Audit-korlát: a(z) % felhasználó az elmúlt órában már % eseményt naplózott — az esemény (%) eldobva.',
      v_caller, v_recent, p_action;
    RETURN NULL;
  END IF;

  -- (5) 2026-08-15: IP + eszköz. Torz fejléc ne buktassa el a naplózást.
  BEGIN
    v_ip := NULLIF(btrim(p_ip), '')::inet;
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;

  INSERT INTO public.audit_log
    (user_id, device_id, action, target_table, target_id, metadata, ip, user_agent)
  VALUES
    (v_caller, p_device_id, p_action, p_target_table, p_target_id, p_metadata,
     v_ip, NULLIF(btrim(p_user_agent), ''))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$audit$;

COMMENT ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, uuid, text, text) IS
  'Audit-esemény naplózása. Fail-closed (auth.uid() kötelező, anon kizárva) + action/target_table max. 120 karakter + metadata max. 8192 bájt + max. 2000 esemény/óra/felhasználó. 2026-08-15: p_ip + p_user_agent (a webes réteg a kérés fejléceiből tölti).';

-- A DROP-pal elveszett hozzáférés-korlátozás visszaállítása: az RPC-t csak
-- bejelentkezett felhasználó hívhatja (a PUBLIC/anon alapértelmezett EXECUTE
-- visszaállt volna).
REVOKE ALL ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, uuid, jsonb, uuid, text, text) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. SZAKASZ — a De.2 / Du.2 napszak engedélyezése
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.munkanaplo DROP CONSTRAINT IF EXISTS munkanaplo_napszak_check;
ALTER TABLE public.munkanaplo
  ADD CONSTRAINT munkanaplo_napszak_check
  CHECK (napszak IN ('de', 'du', 'este', 'de2', 'du2'));

COMMENT ON COLUMN public.munkanaplo.napszak IS
  'A szolgálat napszaka. 2026-08-15 (18. pont): ''de2'' / ''du2'' = a nap MÁSODIK délelőtti/délutáni alkalma (a lelkészi jelentés összeadó szabályához). A du boolean legacy-kompatibilitásként marad.';

-- Ugyanez a korlát az igehirdetési terven (ott NOT NULL, DEFAULT 'de').
DO $igeterv$
BEGIN
  IF to_regclass('public.igehirdetesi_terv') IS NOT NULL THEN
    ALTER TABLE public.igehirdetesi_terv DROP CONSTRAINT IF EXISTS igehirdetesi_terv_napszak_check;
    ALTER TABLE public.igehirdetesi_terv
      ADD CONSTRAINT igehirdetesi_terv_napszak_check
      CHECK (napszak IN ('de', 'du', 'este', 'de2', 'du2'));
  END IF;
END
$igeterv$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. SZAKASZ — a `gyerek` tábla felvétele a 2FA opt-in védelembe
-- ───────────────────────────────────────────────────────────────────────────

DO $mfa$
BEGIN
  IF to_regclass('public.gyerek') IS NULL THEN
    RAISE WARNING 'mfa-optin: a gyerek tábla nem létezik — kihagyva';
    RETURN;
  END IF;
  DROP POLICY IF EXISTS mfa_opt_in_aal2 ON public.gyerek;
  CREATE POLICY mfa_opt_in_aal2 ON public.gyerek AS RESTRICTIVE TO authenticated
  USING (
    ARRAY[(SELECT auth.jwt() ->> 'aal')] <@ (
      SELECT CASE WHEN count(id) > 0
                  THEN ARRAY['aal2']
                  ELSE ARRAY['aal1', 'aal2'] END
        FROM auth.mfa_factors
       WHERE user_id = (SELECT auth.uid()) AND status = 'verified'
    )
  );
END
$mfa$;

COMMIT;

-- ─── ELLENŐRZÉS (csak olvas) — mind a 4 sorban ✅ kell álljon ───────────────
SELECT '1. napló fail-closed (anon kizárva)' AS ellenorzes,
       CASE WHEN prosrc LIKE '%Nincs bejelentkezett felhasználó%'
             AND prosrc LIKE '%2000%'
             AND prosrc LIKE '%8192%'
            THEN '✅ mind a 4 őr visszaállt'
            ELSE '❌ HIÁNYZIK egy vagy több őr!' END AS allapot
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'log_audit_event'
UNION ALL
SELECT '2. napló: anon NEM hívhatja',
       CASE WHEN has_function_privilege('anon',
              (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'log_audit_event' LIMIT 1), 'EXECUTE')
            THEN '❌ az anon MÉG MINDIG hívhatja!' ELSE '✅' END
UNION ALL
SELECT '3. munkanapló De.2/Du.2 menthető',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'munkanaplo_napszak_check'
           AND conrelid = 'public.munkanaplo'::regclass
           AND pg_get_constraintdef(oid) LIKE '%de2%'
       ) THEN '✅' ELSE '❌ a CHECK még mindig tiltja!' END
UNION ALL
SELECT '4. gyerek tábla 2FA-védelem',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'gyerek'
           AND policyname = 'mfa_opt_in_aal2' AND permissive = 'RESTRICTIVE'
       ) THEN '✅' ELSE '❌ hiányzik' END;
