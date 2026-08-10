-- ============================================================================
-- 2026-08-11 — LELKÉSZI (PRIVÁT) NAPTÁR-FEED
--
-- MIT AD
-- ──────
-- A 2026-08-02-es PR-20 a gyülekezet NYILVÁNOS programnaptárát tette
-- előfizethetővé (congregations.calendar_feed_token + public_calendar_feed).
-- Ez a migráció a MÁSIK felét adja hozzá: a lelkész SAJÁT, privát naptárát,
-- amelyben az eddig tárolt, de naptárra soha ki nem számolt évfordulók
-- jelennek meg — születésnap, névnap, házassági és konfirmációi évforduló.
--
-- MIÉRT KÜLÖN TÁBLA (és miért NEM a profiles / profile_preferences oszlopa)
-- ────────────────────────────────────────────────────────────────────────
--  1) A `profiles` táblát rengeteg funkció olvassa, és 2026-08-10-ig a
--     `profiles_read` policy `USING (true)` volt — vagyis BÁRMELY bejelentkezett
--     felhasználó látta az ország összes profilját. Egy titkos, személyes
--     adatokat feltáró tokent SOHA nem szabad olyan táblába tenni, amelynek az
--     olvasási köre tág vagy változékony. Külön táblával a policy egyetlen
--     sorban kimondható és nem sodródik el: „csak a saját sorod".
--  2) A `profile_preferences` egy UI-beállítás-zsák, amit az app `upsert`-tel ír
--     (default_dashboard, last_used_scope). Egy titok, amit mellékesen felülír
--     egy scope-mentés, időzített bomba.
--  3) Külön tábla mellett a VISSZAVONÁS egyetlen DELETE — nincs „üres string
--     vagy NULL?" kétértelműség, és a `last_used_at` mezőből a lelkész látja,
--     hogy a Google tényleg húzza-e a naptárat.
--
-- MIÉRT NINCS A SORBAN `congregation_id`
-- ──────────────────────────────────────
-- Ha a hatókört a KLIENS írná be a sorba, egy felhasználó tetszőleges
-- gyülekezet azonosítóját beírva annak a gyülekezetnek a névsorát olvashatná ki
-- a feeden át (jogosultság-emelés). Ezért a hatókört KIZÁRÓLAG a szerver oldja
-- fel, KÉRÉSENKÉNT, a token TULAJDONOSÁBÓL — roles-first sorrendben, és ha nem
-- egyértelmű, FAIL-CLOSED módon megtagadja a kiszolgálást.
--
-- Futtatás: Supabase SQL Editor, az EGÉSZ fájl kijelölés nélkül. Idempotens.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) A token-tábla
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lelkeszi_naptar_token (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Független, kriptográfiailag erős véletlen: a nyilvános
  -- congregations.calendar_feed_token értékéből SEMMILYEN módon nem vezethető le.
  token        uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS lelkeszi_naptar_token_token_uq
  ON public.lelkeszi_naptar_token (token);

COMMENT ON TABLE public.lelkeszi_naptar_token IS
  'Lelkészi (privát) naptár-feed titkos tokenje felhasználónként — /api/calendar/lelkeszi/<token> (2026-08-11).';
COMMENT ON COLUMN public.lelkeszi_naptar_token.last_used_at IS
  'Mikor húzta le utoljára egy naptár-szolgáltató a feedet (a profilon látszik).';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) RLS — SZIGORÚAN csak a saját sor
-- ─────────────────────────────────────────────────────────────────────────
-- ⚠️ SZÁNDÉKOSAN NINCS `FORCE ROW LEVEL SECURITY`.
-- A FORCE a TÁBLA TULAJDONOSÁRA is ráhúzza a policy-ket, a lenti feed-RPC pedig
-- SECURITY DEFINER (tehát a tulajdonos jogán fut, JWT és `auth.uid()` NÉLKÜL —
-- a Google szervere kéri le). FORCE mellett a `user_id = auth.uid()` feltétel
-- SOHA nem teljesülne, és MINDEN privát naptár némán 404-et adna. A sima ENABLE
-- pontosan azt zárja ki, amit kell: más BEJELENTKEZETT felhasználó olvasását.
ALTER TABLE public.lelkeszi_naptar_token ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lelkeszi_naptar_token_own_select ON public.lelkeszi_naptar_token;
DROP POLICY IF EXISTS lelkeszi_naptar_token_own_insert ON public.lelkeszi_naptar_token;
DROP POLICY IF EXISTS lelkeszi_naptar_token_own_update ON public.lelkeszi_naptar_token;
DROP POLICY IF EXISTS lelkeszi_naptar_token_own_delete ON public.lelkeszi_naptar_token;

CREATE POLICY lelkeszi_naptar_token_own_select ON public.lelkeszi_naptar_token
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY lelkeszi_naptar_token_own_insert ON public.lelkeszi_naptar_token
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY lelkeszi_naptar_token_own_update ON public.lelkeszi_naptar_token
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY lelkeszi_naptar_token_own_delete ON public.lelkeszi_naptar_token
  FOR DELETE TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.lelkeszi_naptar_token FROM PUBLIC;
REVOKE ALL ON public.lelkeszi_naptar_token FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lelkeszi_naptar_token TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) A feed-RPC
--
-- SECURITY DEFINER, mert a feedet a Google/Apple szervere kéri le — ott NINCS
-- bejelentkezett felhasználó, az egyetlen kulcs a token. A hatókört a függvény
-- MAGA oldja fel a token tulajdonosából (roles-first), és fail-closed módon
-- megtagadja, ha nincs vagy nem egyértelmű.
--
-- ⚠️ EXECUTE jog CSAK `service_role`-nak. A nyilvános feed RPC-jét azért lehetett
-- `anon`-nak adni, mert az csak programcímeket ad vissza; EZ viszont neveket és
-- évfordulókat, tehát személyes adatot. Így a PostgREST anon-felületén ez a
-- függvény NEM LÉTEZIK; kizárólag a szerver-oldali route hívhatja.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lelkeszi_naptar_feed(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
VOLATILE
AS $$
DECLARE
  v_user        uuid;
  v_cong        uuid;
  v_role_cnt    int;
  v_nev         text;
  v_szuletes    jsonb;
  v_nevnap      jsonb;
  v_hazassag    jsonb;
  v_konfirmacio jsonb;
BEGIN
  IF p_token IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT user_id INTO v_user
  FROM public.lelkeszi_naptar_token
  WHERE token = p_token;

  -- Visszavont (törölt) vagy ismeretlen token → azonnali elutasítás.
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- ── HATÓKÖR: roles-first, fail-closed ──
  -- (1) A profile_roles jóváhagyott, aktív gyülekezeti szerepkörei.
  SELECT count(*), min(scope_id)
  INTO v_role_cnt, v_cong
  FROM (
    SELECT DISTINCT scope_id
    FROM public.profile_roles
    WHERE profile_id = v_user
      AND scope = 'congregation'
      AND scope_id IS NOT NULL
      AND approval_status = 'approved'
      AND active = true
  ) s;

  -- Két vagy több gyülekezet: a feed URL-t a lelkész EGYSZER illeszti be a
  -- Google Naptárba — nem dönthetjük el helyette, melyik gyülekezetről van szó,
  -- és NEM keverhetjük össze két gyülekezet névsorát. Inkább megtagadjuk.
  IF v_role_cnt > 1 THEN
    RETURN jsonb_build_object('status', 'ambiguous_scope');
  END IF;

  -- (2) Fallback: a profil skalár gyülekezete.
  IF v_role_cnt = 0 THEN
    SELECT congregation_id INTO v_cong FROM public.profiles WHERE id = v_user;
  END IF;

  IF v_cong IS NULL THEN
    RETURN jsonb_build_object('status', 'no_scope');
  END IF;

  UPDATE public.lelkeszi_naptar_token
  SET last_used_at = now()
  WHERE token = p_token;

  SELECT COALESCE(nev_hu, name) INTO v_nev
  FROM public.congregations WHERE id = v_cong;

  -- ── Születésnapok ──
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'csaladnev', s.csaladnev,
    'k_nev', s.k_nev,
    'namepattern', s.namepattern,
    'allapot', s.allapot,
    'datum', to_char(s.sz_datum, 'YYYY-MM-DD')
  ) ORDER BY s.id), '[]'::jsonb)
  INTO v_szuletes
  FROM public.szemely s
  WHERE s.congregation_id = v_cong
    AND s.meghalt = false
    AND s.isvisible = true
    AND s.sz_datum IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.elkoltozott e
      WHERE e.id_szemely = s.id AND e.congregation_id = v_cong
    );

  -- ── Névnapok (szemely.k_nev ⟷ nevnap.nev1/nev2/nev3) ──
  -- A honap/nap oszlopok varchar-ok; a ~ '^[0-9]+$' őr nélkül egyetlen
  -- elgépelt sor futásidejű hibával az EGÉSZ feedet 503-ra vinné.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'csaladnev', s.csaladnev,
    'k_nev', s.k_nev,
    'namepattern', s.namepattern,
    'allapot', s.allapot,
    'honap', n.honap::int,
    'nap', n.nap::int
  ) ORDER BY s.id), '[]'::jsonb)
  INTO v_nevnap
  FROM public.szemely s
  JOIN public.nevnap n
    ON n.honap ~ '^[0-9]+$'
   AND n.nap ~ '^[0-9]+$'
   AND s.k_nev IS NOT NULL
   AND btrim(s.k_nev) <> ''
   AND (n.nev1 = s.k_nev OR n.nev2 = s.k_nev OR n.nev3 = s.k_nev)
  WHERE s.congregation_id = v_cong
    AND s.meghalt = false
    AND s.isvisible = true
    AND NOT EXISTS (
      SELECT 1 FROM public.elkoltozott e
      WHERE e.id_szemely = s.id AND e.congregation_id = v_cong
    );

  -- ── Házassági évfordulók ──
  -- CSAK akkor, ha MINDKÉT házasfél él és nem költözött el: az özvegynek az
  -- esküvő napja gyászdátum, nem ünnep — ilyet nem küldünk push-értesítésbe.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', h.id,
    'datum', to_char(h.datum, 'YYYY-MM-DD'),
    'ferfi', jsonb_build_object(
      'id', f.id, 'csaladnev', f.csaladnev, 'k_nev', f.k_nev,
      'namepattern', f.namepattern, 'allapot', f.allapot),
    'no', jsonb_build_object(
      'id', w.id, 'csaladnev', w.csaladnev, 'k_nev', w.k_nev,
      'namepattern', w.namepattern, 'allapot', w.allapot)
  ) ORDER BY h.id), '[]'::jsonb)
  INTO v_hazassag
  FROM public.hazassag h
  JOIN public.szemely f ON f.id = h.id_ferfi
  JOIN public.szemely w ON w.id = h.id_no
  WHERE h.congregation_id = v_cong
    AND h.datum IS NOT NULL
    AND f.meghalt = false AND w.meghalt = false
    AND f.isvisible = true AND w.isvisible = true
    AND NOT EXISTS (SELECT 1 FROM public.elkoltozott e
                    WHERE e.id_szemely = f.id AND e.congregation_id = v_cong)
    AND NOT EXISTS (SELECT 1 FROM public.elkoltozott e
                    WHERE e.id_szemely = w.id AND e.congregation_id = v_cong);

  -- ── Konfirmációi évfordulók ──
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', k.id,
    'csaladnev', s.csaladnev,
    'k_nev', s.k_nev,
    'namepattern', s.namepattern,
    'allapot', s.allapot,
    'datum', to_char(k.datum, 'YYYY-MM-DD')
  ) ORDER BY k.id), '[]'::jsonb)
  INTO v_konfirmacio
  FROM public.konfirmalas k
  JOIN public.szemely s ON s.id = k.id_szemely
  WHERE k.congregation_id = v_cong
    AND k.datum IS NOT NULL
    AND s.meghalt = false
    AND s.isvisible = true
    AND NOT EXISTS (
      SELECT 1 FROM public.elkoltozott e
      WHERE e.id_szemely = s.id AND e.congregation_id = v_cong
    );

  RETURN jsonb_build_object(
    'status', 'ok',
    'congregation_name', COALESCE(v_nev, 'Gyülekezet'),
    'szuletesnapok', v_szuletes,
    'nevnapok', v_nevnap,
    'hazassagok', v_hazassag,
    'konfirmaciok', v_konfirmacio
  );
END;
$$;

COMMENT ON FUNCTION public.lelkeszi_naptar_feed(uuid) IS
  'Lelkészi (privát) naptár-feed adatforrás (2026-08-11): a lelkeszi_naptar_token alapján a token TULAJDONOSÁNAK gyülekezetéből adja az évfordulókat. Fail-closed: több vagy nulla gyülekezetnél nem szolgál ki.';

REVOKE ALL ON FUNCTION public.lelkeszi_naptar_feed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lelkeszi_naptar_feed(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.lelkeszi_naptar_feed(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lelkeszi_naptar_feed(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) VERIFIKÁCIÓ (a Studio csak az UTOLSÓ eredményt mutatja — futtasd
--    egyesével, ha mindet látni akarod)
-- ─────────────────────────────────────────────────────────────────────────

-- 4/a: létrejött a tábla, be van kapcsolva az RLS, és NINCS force?
--      (várt: 1 sor, rls = true, force_rls = false)
SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'lelkeszi_naptar_token';

-- 4/b: az anon NEM férhet hozzá sem a táblához, sem a függvényhez (várt: 0, 0)
SELECT
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='lelkeszi_naptar_token' AND grantee='anon') AS anon_tabla_jog,
  (SELECT count(*) FROM information_schema.role_routine_grants
    WHERE routine_schema='public' AND routine_name='lelkeszi_naptar_feed' AND grantee IN ('anon','PUBLIC')) AS anon_fv_jog;

-- 4/c: ismeretlen tokenre fail-closed választ ad (várt: "not_found")
SELECT public.lelkeszi_naptar_feed('00000000-0000-0000-0000-000000000000'::uuid) ->> 'status' AS proba_status;
