-- ============================================================================
-- 2026-09-05 — ASZTALI ALKALMAZÁS ÖSSZEKAPCSOLÁSA A WEBES FIÓKKAL
--              („eszköz-kapcsolás", device-flow)
-- ============================================================================
-- MIT AD
-- ──────
-- Az asztali (Tauri) alkalmazás EDDIG csak e-mail + jelszóval tudott belépni.
-- A Google-fiókkal regisztrált lelkésznek NINCS jelszava — az asztali app
-- számára gyakorlatilag elérhetetlen volt. A Tauri webview-ban OAuth-
-- visszairányítás nincs (detectSessionInUrl:false), ezért a belépés a
-- „tévé-belépés" mintáját követi:
--
--   1. az asztali app kitalálhatatlan KÓDOT generál, a hash-ét ide beírja,
--      és a rendszer-böngészőben megnyitja a kartoteka.app/desktop-kapcsolas
--      oldalt (ahol a lelkész Google-lel VAGY e-maillel jelentkezik be);
--   2. a weben — BEJELENTKEZVE — a lelkész látja az eszköz nevét és a
--      6 jegyű ELLENŐRZŐ KÓDOT (ugyanaz, amit az asztali app is mutat), és
--      jóváhagyja; a szerver ekkor egy egyszer használatos belépő-tokent
--      (GoTrue magic-link token_hash) tesz a sorba;
--   3. az asztali app 2 mp-enként kérdezi a saját kódjával; jóváhagyás után
--      EGYSZER megkapja a tokent (a sor azonnal „felhasználva" lesz, a token
--      törlődik), és a Supabase-kliens `verifyOtp`-vel munkamenetet nyit.
--
-- Ugyanez a mechanizmus az ELFELEJTETT PIN útja is: az asztali app törli a
-- helyi PIN-t, a lelkész a weben (bejelentkezés után) jóváhagyja az újra-
-- kapcsolást, és az asztali app új PIN-t kér. A PIN SOHA nem hagyja el a gépet.
--
-- BIZTONSÁGI ELVEK
-- ────────────────
--  · A NYERS kód csak az asztali gépen él; itt a SHA-256 hash-e áll. Aki az
--    adatbázist olvassa, nem tudja „bepollolni" a tokent.
--  · A belépő-token (token_hash) CSAK a jóváhagyás és az első lekérés közötti
--    másodpercekben áll a sorban, utána NULL. Egyszer használatos.
--  · Az ELLENŐRZŐ KÓD a phishing ellen véd: idegen kóddal küldött hivatkozást
--    a lelkész azért nem hagy jóvá, mert a saját gépén MÁS 6 jegyű szám áll.
--  · A táblát a kliens KÖZVETLENÜL nem írja: minden írás a szerver
--    (service_role) útján megy; az authenticated csak a SAJÁT, már
--    felhasznált sorait olvashatja (eszközlista) és törölheti.
--  · Lejárat 10 perc; a lejárt sorokat a szerver takarítja.
--
-- MENTÉS-BESOROLÁS: `kizart_titok` — a sor egy rövid életű belépő-titkot
-- hordoz(hat), mentésbe SOHA nem kerülhet. (Besorolás nélkül a napi mentés
-- fail-closed módon megállna — ez a projekt ismert hibaosztálya.)
--
-- Futtatás: Supabase SQL Editor, az EGÉSZ fájl. Idempotens.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) A tábla
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.desktop_kapcsolas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SHA-256(kód) hex — a nyers kód az asztali gépen marad.
  kod_hash         text NOT NULL,
  -- 6 jegyű, a felhasználó mindkét oldalon látja (phishing-védelem).
  ellenorzo_kod    text NOT NULL,
  -- Az asztali gép neve (hostname / a felhasználó által adott név).
  eszkoz_nev       text,
  allapot          text NOT NULL DEFAULT 'varakozik'
                     CHECK (allapot IN ('varakozik','jovahagyva','felhasznalva','lejart','elutasitva')),
  -- A jóváhagyó fiók — a jóváhagyás pillanatától.
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  -- GoTrue magic-link token_hash — CSAK jovahagyva → felhasznalva között.
  token_hash       text,
  -- Az asztali kérő IP-hash-e (spam-fék, GDPR-kompatibilis: csak sózott hash).
  ip_hash          text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  lejar            timestamptz NOT NULL,
  jovahagyva_at    timestamptz,
  felhasznalva_at  timestamptz,
  -- Az asztali app utolsó ismert jelentkezése (eszközlista „utoljára aktív").
  utolso_aktivitas timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS desktop_kapcsolas_kod_hash_uq
  ON public.desktop_kapcsolas (kod_hash);
CREATE INDEX IF NOT EXISTS desktop_kapcsolas_user_idx
  ON public.desktop_kapcsolas (user_id, felhasznalva_at DESC);
CREATE INDEX IF NOT EXISTS desktop_kapcsolas_lejar_idx
  ON public.desktop_kapcsolas (lejar);

COMMENT ON TABLE public.desktop_kapcsolas IS
  '2026-09-05: az asztali alkalmazás ⇄ webes fiók összekapcsolása (device-flow). A nyers kód az asztali gépen marad, itt csak a hash; a belépő-token egyszer használatos és a lekérés után törlődik.';
COMMENT ON COLUMN public.desktop_kapcsolas.token_hash IS
  'GoTrue magic-link token_hash — CSAK a jóváhagyás és az első asztali lekérés között; utána NULL.';
COMMENT ON COLUMN public.desktop_kapcsolas.ellenorzo_kod IS
  '6 jegyű ellenőrző kód: az asztali app és a webes jóváhagyó oldal ugyanazt mutatja — idegen kérést a lelkész erről ismer fel.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) RLS — az authenticated CSAK a saját, már felhasznált sorait látja
--    (eszközlista), és törölheti („elfelejtem az eszközt"). Írás kizárólag a
--    szerver (service_role) útján. Az anon SEMMIT.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.desktop_kapcsolas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS desktop_kapcsolas_own_select ON public.desktop_kapcsolas;
DROP POLICY IF EXISTS desktop_kapcsolas_own_delete ON public.desktop_kapcsolas;

CREATE POLICY desktop_kapcsolas_own_select ON public.desktop_kapcsolas
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND allapot = 'felhasznalva');
CREATE POLICY desktop_kapcsolas_own_delete ON public.desktop_kapcsolas
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.desktop_kapcsolas FROM PUBLIC;
REVOKE ALL ON public.desktop_kapcsolas FROM anon;
-- ⚠️ EXPLICIT REVOKE AZ authenticated-TŐL IS: a 2026-04-23-as m0-HOTFIX
-- `ALTER DEFAULT PRIVILEGES … GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
-- TO authenticated` MINDEN új public-táblára automatikusan jogot ad — a
-- PUBLIC/anon-REVOKE ezt nem érinti. Enélkül az INSERT/UPDATE némán
-- öröklődne, a lenti „nincs INSERT/UPDATE" ígéret hamis lenne, és a
-- védelem egyetlen rétegen (RLS) állna kettő helyett. (Precedens:
-- 2026-07-16-f5-lelkeszi-jelentes.sql; a 05. rács-sor ellenőrzi.)
REVOKE ALL ON public.desktop_kapcsolas FROM authenticated;
GRANT SELECT, DELETE ON public.desktop_kapcsolas TO authenticated;
-- ⚠️ INSERT/UPDATE szándékosan NINCS az authenticated-nek: a kliens nem
-- gyárthat és nem hagyhat jóvá sort a szerver ellenőrzése nélkül.
-- A szerver (service_role) ír — explicit, hogy ne a default privileges-en múljon.
GRANT ALL ON public.desktop_kapcsolas TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Mentés-besorolás — KÖTELEZŐ minden új táblához (fail-closed mentés).
-- ─────────────────────────────────────────────────────────────────────────
DO $besorolas$
BEGIN
  IF to_regclass('public.backup_table_policy') IS NULL THEN
    RAISE EXCEPTION 'A backup_table_policy tábla nem létezik — előbb a 2026-08-11-biztonsagi-mentes.sql fusson le.';
  END IF;
  INSERT INTO public.backup_table_policy
    (tabla, hatokor, join_predikatum, reteg, visszaallithato, megjegyzes)
  VALUES
    ('desktop_kapcsolas', 'kizart_titok', NULL, NULL, false,
     '2026-09-05 — Asztali eszköz-kapcsolás (device-flow). Rövid életű belépő-titkot hordozhat (token_hash), ezért mentésbe SOHA nem kerül; a sorok 10 perc után lejárnak, az eszközlista újra felépíthető.')
  ON CONFLICT (tabla) DO UPDATE SET
    hatokor = EXCLUDED.hatokor,
    join_predikatum = EXCLUDED.join_predikatum,
    reteg = EXCLUDED.reteg,
    visszaallithato = EXCLUDED.visszaallithato,
    megjegyzes = EXCLUDED.megjegyzes;
END
$besorolas$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Takarítás — a lejárt/felhasznált sorok titkai. (A szerver is takarít
--    minden új kérésnél; ez a függvény kézi/ütemezett futtatásra való.)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.desktop_kapcsolas_takaritas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_torolt integer;
BEGIN
  -- Lejárt, jóvá nem hagyott kérések: nyomtalanul törölhetők.
  DELETE FROM public.desktop_kapcsolas
  WHERE allapot IN ('varakozik','jovahagyva','lejart','elutasitva')
    AND lejar < now() - interval '1 day';
  GET DIAGNOSTICS v_torolt = ROW_COUNT;
  -- Felhasznált sorokban token SOHA nem maradhat (védelmi biztosíték).
  UPDATE public.desktop_kapcsolas
  SET token_hash = NULL
  WHERE token_hash IS NOT NULL
    AND (allapot = 'felhasznalva' OR lejar < now());
  RETURN v_torolt;
END;
$$;

REVOKE ALL ON FUNCTION public.desktop_kapcsolas_takaritas() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.desktop_kapcsolas_takaritas() FROM anon;
REVOKE ALL ON FUNCTION public.desktop_kapcsolas_takaritas() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.desktop_kapcsolas_takaritas() TO service_role;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFIKÁCIÓ — EGY eredmény-rács (a Supabase-szerkesztő csak az utolsót mutatja)
-- ============================================================================
SELECT lepes, allapot FROM (
  SELECT 1 AS sorrend, '01. desktop_kapcsolas tábla' AS lepes,
    CASE WHEN to_regclass('public.desktop_kapcsolas') IS NOT NULL THEN '✅' ELSE '❌' END AS allapot
  UNION ALL
  SELECT 2, '02. RLS bekapcsolva',
    CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.desktop_kapcsolas'::regclass)
      THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 3, '03. policy-k (2: own_select, own_delete)',
    CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='desktop_kapcsolas') = 2
      THEN '✅' ELSE '❌ ' || (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='desktop_kapcsolas') END
  UNION ALL
  SELECT 4, '04. anon-nak NINCS joga',
    CASE WHEN NOT has_table_privilege('anon', 'public.desktop_kapcsolas', 'SELECT')
      AND NOT has_table_privilege('anon', 'public.desktop_kapcsolas', 'INSERT') THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 5, '05. authenticated: SELECT+DELETE igen, INSERT/UPDATE nem',
    CASE WHEN has_table_privilege('authenticated', 'public.desktop_kapcsolas', 'SELECT')
      AND has_table_privilege('authenticated', 'public.desktop_kapcsolas', 'DELETE')
      AND NOT has_table_privilege('authenticated', 'public.desktop_kapcsolas', 'INSERT')
      AND NOT has_table_privilege('authenticated', 'public.desktop_kapcsolas', 'UPDATE') THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 6, '06. mentés-besorolás (kizart_titok)',
    COALESCE((SELECT '✅ ' || hatokor FROM public.backup_table_policy WHERE tabla='desktop_kapcsolas'), '❌ HIÁNYZIK')
  UNION ALL
  SELECT 7, '07. takarító függvény',
    CASE WHEN to_regprocedure('public.desktop_kapcsolas_takaritas()') IS NOT NULL THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 8, '08. besorolatlan élő táblák (a mentés miatt)',
    CASE WHEN cnt = 0 THEN '✅ nincs' ELSE '❌ ' || cnt || ' db: ' || nevek END
  FROM (
    SELECT COUNT(*) AS cnt, COALESCE(string_agg(t.table_name, ', '), '') AS nevek
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      AND NOT EXISTS (SELECT 1 FROM public.backup_table_policy p WHERE p.tabla = t.table_name)
  ) x
) y ORDER BY sorrend;
