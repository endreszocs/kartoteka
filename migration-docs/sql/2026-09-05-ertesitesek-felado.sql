-- ============================================================================
-- 2026-09-05 — ÉRTESÍTÉSEK: KITŐL JÖN AZ ÜZENET? (feladó-oszlopok)
-- ============================================================================
-- MIT AD
-- ──────
-- A tulajdonos kérése: az értesítések felülete legyen olyan, mint egy
-- beszélgetés-ablak — látni, KITŐL, MIKOR, MIT. Az `ertesitesek` tábla
-- 2026-04 óta feladó nélkül él (egy `tipus` és egy szabad szöveg); a 36
-- beszúró hely egyike sem rögzítette a küldőt.
--
-- Három új oszlop:
--   felado_tipus  — rendszer | rendszergazda | egyhazkerulet | egyhazmegye |
--                   gyulekezet | felhasznalo
--   felado_nev    — a megjelenített név („Kézdi-Orbai Református Egyházmegye")
--   felado_id     — az entitás azonosítója (profil / gyülekezet / megye / kerület)
--
-- + egy ÓVATOS, egyszeri visszatöltés a régi sorokra — a típusból és a
--   hivatkozásból, ugyanazzal a szabállyal, amit az alkalmazás levezetője
--   (apps/web/lib/notifications/felado.ts → feladoBontas) használ. Ahol nem
--   tudjuk, ott „Kartotéka rendszer" — személyt SOHA nem találunk ki.
--
-- + trigger-alapértelmezés az ÚJ sorokra: ha egy beszúró hely (régi kód,
--   SQL-worker) nem ad feladót, a trigger ugyanazzal a levezetéssel tölti ki,
--   hogy a felület soha ne lásson üres feladót.
--
-- MENTÉS-BESOROLÁS: nem új tábla, csak oszlop → nem kell besorolás.
-- (Megjegyzés a felmérésből: az ertesitesek 'gyulekezet' hatókörű, ezért a
-- congregation_id NÉLKÜLI sorok — hírlevél, admin-, kerületi értesítés — a
-- gyülekezeti mentésből kimaradnak. Ez KÜLÖN döntés, itt nem nyúlunk hozzá.)
--
-- Futtatás: Supabase SQL Editor, az EGÉSZ fájl. Idempotens.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Oszlopok
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ertesitesek
  ADD COLUMN IF NOT EXISTS felado_tipus text,
  ADD COLUMN IF NOT EXISTS felado_nev   text,
  ADD COLUMN IF NOT EXISTS felado_id    uuid,
  -- true = a feladót NEM a beszúró adta, hanem a levezetés (trigger/visszatöltés)
  -- → a felület őszintén „valószínű feladó"-t mondhat, és egy későbbi
  -- újra-visszatöltés tudja, mit szabad felülírni.
  ADD COLUMN IF NOT EXISTS felado_levezetett boolean NOT NULL DEFAULT false,
  -- A törzs formátuma: 'text' (alap — escape-elve jelenik meg) vagy 'markdown'
  -- (CSAK a rendszergazdai hírlevél). FAIL-CLOSED: felhasználói szabad szöveg
  -- (elutasítás indoklása, átjelentkezési megjegyzés) SOHA nem fut markdownon.
  ADD COLUMN IF NOT EXISTS uzenet_format text NOT NULL DEFAULT 'text',
  -- A hírlevél-sor visszamutat a körlevélre (a szál „Kartotéka" címe alatt).
  ADD COLUMN IF NOT EXISTS broadcast_id uuid;

DO $format_check$
DECLARE
  v_name text;
BEGIN
  SELECT c.conname INTO v_name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.ertesitesek'::regclass
    AND c.contype = 'c'
    AND c.conkey = ARRAY[(
      SELECT a.attnum FROM pg_attribute a
      WHERE a.attrelid = 'public.ertesitesek'::regclass AND a.attname = 'uzenet_format'
    )]::int2[];
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ertesitesek DROP CONSTRAINT %I', v_name);
  END IF;
END
$format_check$;

ALTER TABLE public.ertesitesek
  ADD CONSTRAINT ertesitesek_uzenet_format_check
  CHECK (uzenet_format IN ('text','markdown'));

-- broadcast_id FK — csak ha a system_broadcasts tábla létezik (szerep-toleráns).
DO $broadcast_fk$
BEGIN
  IF to_regclass('public.system_broadcasts') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ertesitesek_broadcast_id_fkey') THEN
    ALTER TABLE public.ertesitesek
      ADD CONSTRAINT ertesitesek_broadcast_id_fkey
      FOREIGN KEY (broadcast_id) REFERENCES public.system_broadcasts(id) ON DELETE SET NULL;
  END IF;
END
$broadcast_fk$;

-- A hírlevél-sorok visszamenőleg markdown-formátumúak (a törzsük az).
UPDATE public.ertesitesek
SET uzenet_format = 'markdown'
WHERE uzenet_format = 'text'
  AND (tipus = 'release' OR cim ~* '^kartotéka\s+[—–-]');

DO $felado_check$
DECLARE
  v_name text;
BEGIN
  SELECT c.conname INTO v_name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.ertesitesek'::regclass
    AND c.contype = 'c'
    AND c.conkey = ARRAY[(
      SELECT a.attnum FROM pg_attribute a
      WHERE a.attrelid = 'public.ertesitesek'::regclass AND a.attname = 'felado_tipus'
    )]::int2[];
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ertesitesek DROP CONSTRAINT %I', v_name);
  END IF;
END
$felado_check$;

ALTER TABLE public.ertesitesek
  ADD CONSTRAINT ertesitesek_felado_tipus_check
  CHECK (felado_tipus IS NULL OR felado_tipus IN
    ('rendszer','rendszergazda','egyhazkerulet','egyhazmegye','gyulekezet','felhasznalo'));

COMMENT ON COLUMN public.ertesitesek.felado_tipus IS
  '2026-09-05: kitől jön az üzenet — rendszer | rendszergazda | egyhazkerulet | egyhazmegye | gyulekezet | felhasznalo. A beszélgetés-nézet ezek szerint csoportosít.';
COMMENT ON COLUMN public.ertesitesek.felado_nev IS
  '2026-09-05: a feladó megjelenített neve (a beszélgetés-lista címe).';
COMMENT ON COLUMN public.ertesitesek.felado_id IS
  '2026-09-05: a feladó entitás azonosítója (profiles.id / congregations.id / dioceses.id / districts.id), ha van.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) A levezető függvény — EGY szabály a visszatöltésnek ÉS a triggernek.
--    (Tükre az alkalmazás feladoBontas()-ának — ha az egyik változik, a másik is.)
-- ─────────────────────────────────────────────────────────────────────────
-- A korábbi, 4 paraméteres változat (ha egy előző futásból ott maradt) — külön
-- túlterhelés lenne, nem cserélné le a CREATE OR REPLACE; ezért előbb töröljük.
DROP FUNCTION IF EXISTS public.ertesites_felado_levezetes(text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.ertesites_felado_levezetes(
  p_tipus text,
  p_hivatkozas text,
  p_cim text,
  p_congregation_id uuid,
  p_uzenet text DEFAULT NULL
)
RETURNS TABLE (felado_tipus text, felado_nev text, felado_id uuid)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
-- ⚠️ A szabályok a BESZÚRÓ HELYEK megnyitásával pontosítva (2026-09-05-i brief,
--    5 osztály volt hibás az első vázlatban). Az alkalmazás feladoBontas()-a
--    (apps/web/lib/notifications/felado.ts) ugyanezt tükrözi — együtt változnak.
DECLARE
  v_tipus text := lower(coalesce(p_tipus, ''));
  v_hiv   text := lower(coalesce(p_hivatkozas, ''));
  v_cim   text := btrim(coalesce(p_cim, ''));
  v_cim_kis text := lower(btrim(coalesce(p_cim, '')));
  v_uzenet text := btrim(coalesce(p_uzenet, ''));
  v_cong_nev text;
BEGIN
  -- Regisztráció: a név a TÖRZS eleje („Kovács János (email) regisztrált…").
  IF v_tipus = 'registration' THEN
    felado_tipus := 'felhasznalo';
    -- CSAK ha a törzsben van „ (" — különben a split_part a TELJES törzset adná
    -- vissza névként. A TS feladoBontas ugyanígy: nincs „ (" → tartalék név;
    -- 120 fölött sem név. Egy szabály, két oldal.
    felado_nev := CASE WHEN position(' (' IN v_uzenet) > 0
                       THEN NULLIF(btrim(split_part(v_uzenet, ' (', 1)), '')
                       ELSE NULL END;
    IF felado_nev IS NULL OR length(felado_nev) > 120 THEN felado_nev := 'Regisztráló felhasználó'; END IF;
    felado_id := NULL;
    RETURN NEXT; RETURN;
  END IF;
  -- Rendszergazdai: támogatási válasz, hírlevél, „Kartotéka — …" cím, és a
  -- hivatkozás nélküli, ismert rendszergazdai címek.
  IF v_tipus IN ('support_reply', 'release')
     OR v_cim ~* '^kartotéka\s+[—–-]'
     OR v_cim_kis LIKE 'hozzáférése aktiválva%'
     OR v_cim_kis LIKE 'hozzáférés-kérelme nem került elfogadásra%'
     OR v_cim_kis LIKE 'válasz a támogatási kérdésre%'
     OR v_cim_kis LIKE 'üdvözöljük a kartotékában%' THEN
    felado_tipus := 'rendszergazda'; felado_nev := 'Rendszergazda'; felado_id := NULL;
    RETURN NEXT; RETURN;
  END IF;
  -- Gépi (service_role) admin-útvonalak: mentés-riasztás, visszaállítás,
  -- „gyülekezet megürült" → RENDSZER.
  IF v_hiv LIKE '/admin/biztonsagi-mentes%' OR v_hiv LIKE '/admin/veszelyes-zona%'
     OR v_hiv LIKE '/admin/felhasznalok%' THEN
    felado_tipus := 'rendszer'; felado_nev := 'Kartotéka rendszer'; felado_id := NULL;
    RETURN NEXT; RETURN;
  END IF;
  IF v_hiv LIKE '/admin%' OR v_hiv LIKE 'admin_access:%' THEN
    felado_tipus := 'rendszergazda'; felado_nev := 'Rendszergazda'; felado_id := NULL;
    RETURN NEXT; RETURN;
  END IF;
  IF v_hiv LIKE '/dashboard-kerulet%' THEN
    felado_tipus := 'egyhazkerulet'; felado_nev := 'Egyházkerület'; felado_id := NULL;
    RETURN NEXT; RETURN;
  END IF;
  -- Megyei felület: gyülekezet nélküli sor = kerület → megye (felterjesztés);
  -- gyülekezettel = a gyülekezet beküldése a megyének (költségvetés, irat).
  IF v_hiv LIKE '/dashboard-egyhazmegye%' THEN
    IF p_congregation_id IS NULL THEN
      felado_tipus := 'egyhazkerulet'; felado_nev := 'Egyházkerület'; felado_id := NULL;
    ELSE
      SELECT COALESCE(c.nev_hu, c.name) INTO v_cong_nev
      FROM public.congregations c WHERE c.id = p_congregation_id;
      felado_tipus := 'gyulekezet';
      felado_nev := COALESCE(v_cong_nev, 'Gyülekezet');
      felado_id := p_congregation_id;
    END IF;
    RETURN NEXT; RETURN;
  END IF;
  -- Átjelentkezés / iktató-átadás: a sor congregation_id-ja a CÍMZETT oldala,
  -- a küldő a MÁSIK gyülekezet — régi sorból nem találjuk ki.
  IF v_hiv LIKE '/notifications%' OR v_hiv LIKE '/iktato%' THEN
    felado_tipus := 'gyulekezet'; felado_nev := 'Másik gyülekezet'; felado_id := NULL;
    RETURN NEXT; RETURN;
  END IF;
  -- „Hozzáférés jóváhagyva/elutasítva": a jóváhagyó gyülekezet lelkésze.
  IF v_cim_kis LIKE 'hozzáférés jóváhagyva%' OR v_cim_kis LIKE 'hozzáférés elutasítva%' THEN
    SELECT COALESCE(c.nev_hu, c.name) INTO v_cong_nev
    FROM public.congregations c WHERE c.id = p_congregation_id;
    felado_tipus := 'gyulekezet';
    felado_nev := COALESCE(v_cong_nev, 'Gyülekezet');
    felado_id := p_congregation_id;
    RETURN NEXT; RETURN;
  END IF;
  -- A MEGYEI felület régi sorai: a hivatkozásuk a gyülekezeti javító-oldalra
  -- mutat (nem /dashboard-egyhazmegye), ezért csak a CÍMBŐL ismerhetők fel.
  -- A döntést az egyházmegye hozta; a nevét a régi sorból nem tudjuk.
  IF v_cim_kis LIKE 'javítási kérelem jóváhagyva%'
     OR v_cim_kis LIKE 'javítási kérelem elutasítva%'
     OR v_cim_kis LIKE 'visszaküldött dokumentum%' THEN
    felado_tipus := 'egyhazmegye'; felado_nev := 'Egyházmegye'; felado_id := NULL;
    RETURN NEXT; RETURN;
  END IF;
  felado_tipus := 'rendszer'; felado_nev := 'Kartotéka rendszer'; felado_id := NULL;
  RETURN NEXT; RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.ertesites_felado_levezetes(text, text, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ertesites_felado_levezetes(text, text, text, uuid, text) FROM anon;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Trigger: ÚJ sorokon a hiányzó feladót a levezetés tölti ki.
--    A beszúró helyek az alkalmazásban EXPLICIT feladót adnak; ez a háló a
--    régi kódutaknak és az SQL-workereknek (mentés-riasztás, lejárat-emlékeztető).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ertesitesek_felado_alapertelmezes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
BEGIN
  IF NEW.felado_tipus IS NULL OR btrim(coalesce(NEW.felado_nev, '')) = '' THEN
    SELECT * INTO r FROM public.ertesites_felado_levezetes(NEW.tipus, NEW.hivatkozas, NEW.cim, NEW.congregation_id, NEW.uzenet);
    IF NEW.felado_tipus IS NULL THEN NEW.felado_tipus := r.felado_tipus; END IF;
    IF btrim(coalesce(NEW.felado_nev, '')) = '' THEN NEW.felado_nev := r.felado_nev; END IF;
    IF NEW.felado_id IS NULL THEN NEW.felado_id := r.felado_id; END IF;
    NEW.felado_levezetett := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ertesitesek_felado_alapertelmezes ON public.ertesitesek;
CREATE TRIGGER trg_ertesitesek_felado_alapertelmezes
  BEFORE INSERT ON public.ertesitesek
  FOR EACH ROW EXECUTE FUNCTION public.ertesitesek_felado_alapertelmezes();

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Egyszeri visszatöltés a régi sorokra (csak ahol NINCS feladó).
--
-- ⚠️ MIÉRT AL-LEKÉRDEZÉS ÉS NEM `FROM LATERAL fn(e.…)`: az UPDATE FROM-listája
--    a CÉLTÁBLÁRA nem hivatkozhat (analyze.c transformUpdateStmt: a FROM
--    feldolgozása alatt `p_lateral_ok = false`) → az első vázlat
--    `FROM LATERAL public.ertesites_felado_levezetes(e.tipus, …)` alakja
--    `ERROR: invalid reference to FROM-clause entry for table "e"`-vel
--    elhasalt volna, és a Supabase-szerkesztő egy tranzakciójában az EGÉSZ
--    fájl visszagördül (oszlop, trigger, írásvédelem — semmi). Ezért a
--    levezetés egy KÜLÖN aliasú (x) belső SELECT-ben fut, és az id-n
--    kapcsolódik a célsorhoz. Őrszem: scripts/selftest-ertesites-felado-sql.mjs.
--
-- ⚠️ MIÉRT ELŐBB A DROP TRIGGER: ismételt futtatáskor a 4/b írásvédelmi
--    trigger már létezik, és NÉMÁN visszaírná az OLD (NULL) feladót a
--    visszatöltés minden sorára. A trigger a 4/b-ben újra létrejön.
-- ─────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_ertesitesek_felado_irasvedelem ON public.ertesitesek;

UPDATE public.ertesitesek e
SET felado_tipus = lv.felado_tipus,
    felado_nev   = lv.felado_nev,
    felado_id    = lv.felado_id,
    felado_levezetett = true
FROM (
  SELECT x.id, l.felado_tipus, l.felado_nev, l.felado_id
  FROM public.ertesitesek x
  CROSS JOIN LATERAL public.ertesites_felado_levezetes(
    x.tipus, x.hivatkozas, x.cim, x.congregation_id, x.uzenet
  ) l
  WHERE x.felado_tipus IS NULL
) lv
WHERE lv.id = e.id
  AND e.felado_tipus IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 4/b) A feladó-mezők ÍRÁSVÉDELME UPDATE ellen — a visszatöltés UTÁN.
--      Az ertesitesek_user policy FOR ALL, WITH CHECK nélkül: a címzett a
--      saját sorát átírhatná, és „a rendszergazda küldte" feladót hamisíthatna.
--      Olcsó, fail-closed: a feladó és a formátum a beszúráskor dől el.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ertesitesek_felado_irasvedelem()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.felado_tipus := OLD.felado_tipus;
  NEW.felado_nev := OLD.felado_nev;
  NEW.felado_id := OLD.felado_id;
  NEW.felado_levezetett := OLD.felado_levezetett;
  NEW.uzenet_format := OLD.uzenet_format;
  NEW.broadcast_id := OLD.broadcast_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ertesitesek_felado_irasvedelem ON public.ertesitesek;
CREATE TRIGGER trg_ertesitesek_felado_irasvedelem
  BEFORE UPDATE ON public.ertesitesek
  FOR EACH ROW EXECUTE FUNCTION public.ertesitesek_felado_irasvedelem();

-- ─────────────────────────────────────────────────────────────────────────
-- 4/c) MENTÉS-HÉZAG: az ertesitesek 'gyulekezet' hatókörű, ezért a
--      congregation_id NÉLKÜLI sorok (hírlevél, rendszergazdai, kerületi
--      értesítés) a gyülekezeti mentésből kimaradtak. A globális predikátum a
--      NULL-gyülekezetű sorokat a globális mentésbe sorolja (a 2026-08-15-ös
--      S4 minta). Csak ha az oszlop létezik és még üres.
-- ─────────────────────────────────────────────────────────────────────────
DO $mentes_hezag$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='backup_table_policy'
               AND column_name='globalis_predikatum') THEN
    UPDATE public.backup_table_policy
    SET globalis_predikatum = 't.congregation_id IS NULL'
    WHERE tabla = 'ertesitesek' AND globalis_predikatum IS NULL;
  END IF;
END
$mentes_hezag$;

-- Index a beszélgetés-nézet csoportosításához (címzett + feladó + idő).
CREATE INDEX IF NOT EXISTS ertesitesek_user_felado_idx
  ON public.ertesitesek (user_id, felado_tipus, created_at DESC);

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFIKÁCIÓ — EGY eredmény-rács
-- ============================================================================
SELECT lepes, allapot FROM (
  SELECT 1 AS sorrend, '01. felado_* oszlopok' AS lepes,
    CASE WHEN (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ertesitesek'
        AND column_name IN ('felado_tipus','felado_nev','felado_id')) = 3 THEN '✅' ELSE '❌' END AS allapot
  UNION ALL
  SELECT 2, '02. felado_tipus CHECK',
    CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ertesitesek_felado_tipus_check'
      AND conrelid='public.ertesitesek'::regclass) THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 3, '03. levezető függvény + trigger',
    CASE WHEN to_regprocedure('public.ertesites_felado_levezetes(text,text,text,uuid,text)') IS NOT NULL
      AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_ertesitesek_felado_alapertelmezes')
    THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 4, '04. feladó nélküli sor (0 kell)',
    CASE WHEN (SELECT count(*) FROM public.ertesitesek WHERE felado_tipus IS NULL) = 0
      THEN '✅ 0' ELSE '❌ ' || (SELECT count(*) FROM public.ertesitesek WHERE felado_tipus IS NULL) END
  UNION ALL
  SELECT 5, '05. feladó-eloszlás (tájékoztató)',
    COALESCE((SELECT string_agg(felado_tipus || '=' || db, ', ' ORDER BY db DESC)
      FROM (SELECT felado_tipus, count(*) AS db FROM public.ertesitesek GROUP BY felado_tipus) x), 'üres tábla')
  UNION ALL
  SELECT 6, '06. index a beszélgetés-nézethez',
    CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND indexname='ertesitesek_user_felado_idx') THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 7, '07. felado_levezetett + uzenet_format + broadcast_id oszlopok',
    CASE WHEN (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ertesitesek'
        AND column_name IN ('felado_levezetett','uzenet_format','broadcast_id')) = 3 THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 8, '08. írásvédelmi trigger (UPDATE)',
    CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_ertesitesek_felado_irasvedelem')
      THEN '✅' ELSE '❌' END
  UNION ALL
  SELECT 9, '09. hírlevél-sorok markdown formátumúak (tájékoztató)',
    COALESCE((SELECT count(*)::text || ' sor' FROM public.ertesitesek WHERE uzenet_format = 'markdown'), '0')
  UNION ALL
  SELECT 10, '10. mentés-hézag: globalis_predikatum az ertesitesek-en',
    CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='backup_table_policy' AND column_name='globalis_predikatum')
      THEN '⚠️ nincs globalis_predikatum oszlop (S4 nem futott)'
      WHEN EXISTS (SELECT 1 FROM public.backup_table_policy WHERE tabla='ertesitesek'
        AND globalis_predikatum IS NOT NULL) THEN '✅' ELSE '❌' END
) y ORDER BY sorrend;
