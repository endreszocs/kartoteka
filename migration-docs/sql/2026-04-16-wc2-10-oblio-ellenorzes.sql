-- ============================================================================
-- KARTOTEKA WC-2.10 — Oblio ellenőrzés (helyi mappa-alapú)
-- ============================================================================
--
-- Dátum: 2026-04-16
-- Indok: A 2025.07.01 óta kötelező e-Factura miatt a lelkésznek figyelnie
--   kell, hogy a beszállítóktól kapott számlák ténylegesen felkerültek-e az
--   ANAF SPV-be. A KARTOTEKA a helyi mappába letöltött Oblio Wallet ZIP-eket
--   olvassa és összeveti a `kiadas` rekordokkal.
--
-- Új DB elemek:
--   1) kiadas.kedvezmenyezett_cui  → a beszállító CUI/CIF a párosításhoz
--   2) oblio_kiadas_match táblá   → a párosítások perzisztálása
--   3) oblio_fiokok.utolso_xml_letoltes_at → 60 napos ANAF határidő figyelő
--

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. Új mező a kiadas táblában — beszállító CUI
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.kiadas
  ADD COLUMN IF NOT EXISTS kedvezmenyezett_cui text;

COMMENT ON COLUMN public.kiadas.kedvezmenyezett_cui IS
  $$A beszállító CUI/CIF — az Oblio ellenőrzéshez kell, hogy a befogadott
  e-Factura UBL XML egyértelműen párosítható legyen a kiadással.
  NULL: nincs CUI rögzítve, csak név+összeg+dátum alapján próbálkozunk match-elni.$$;

-- Index a CUI-keresésre (gyakori lekérdezés a párosításnál)
CREATE INDEX IF NOT EXISTS kiadas_kedvezmenyezett_cui_idx
  ON public.kiadas (congregation_id, kedvezmenyezett_cui)
  WHERE kedvezmenyezett_cui IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. oblio_kiadas_match tábla — XML ↔ kiadás összerendelés
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.oblio_kiadas_match (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL,
  kiadas_id integer NOT NULL,
  -- ANAF e-Factura egyedi azonosító (a fájlnévből / XML-ből)
  anaf_uuid text NOT NULL,
  -- A párosított XML metaadatai (snapshot, hogy a UI ne kelljen újra parse-olja)
  supplier_cui text,
  supplier_name text,
  invoice_number text,
  invoice_date date,
  invoice_amount numeric(12, 2),
  -- Helyi fájl referencia (relatív útvonal a KARTOTEKA mappához)
  local_file_relpath text,
  -- Hogyan jött létre a match
  match_method text NOT NULL DEFAULT 'manual',
  match_confidence text DEFAULT 'medium',  -- 'high' | 'medium' | 'low'
  manual_note text,
  -- Audit
  matched_at timestamp with time zone NOT NULL DEFAULT now(),
  matched_by uuid,
  CONSTRAINT oblio_kiadas_match_pkey PRIMARY KEY (id),
  CONSTRAINT oblio_kiadas_match_congregation_id_fkey
    FOREIGN KEY (congregation_id) REFERENCES public.congregations(id) ON DELETE CASCADE,
  CONSTRAINT oblio_kiadas_match_kiadas_id_fkey
    FOREIGN KEY (kiadas_id) REFERENCES public.kiadas(id) ON DELETE CASCADE,
  CONSTRAINT oblio_kiadas_match_matched_by_fkey
    FOREIGN KEY (matched_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT oblio_kiadas_match_method_check CHECK (
    match_method = ANY (ARRAY['auto_cui'::text, 'auto_name_amount_date'::text, 'manual'::text])
  ),
  CONSTRAINT oblio_kiadas_match_confidence_check CHECK (
    match_confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])
  ),
  -- Egy ANAF UUID gyülekezetenként csak egyszer lehet párosítva
  CONSTRAINT oblio_kiadas_match_uuid_unique
    UNIQUE (congregation_id, anaf_uuid)
);

COMMENT ON TABLE public.oblio_kiadas_match IS
  $$Az Oblio Wallet-ből letöltött befogadott e-Factura UBL XML és a KARTOTEKA
  kiadas-rekord párosítása. Az auto-matchnek nem kötelező a perzisztálás —
  csak a kézzel megerősítettek vagy a high-confidence kerülnek ide.$$;

COMMENT ON COLUMN public.oblio_kiadas_match.anaf_uuid IS
  $$Az ANAF e-Factura egyedi azonosító — a UBL XML <cbc:UUID> mezőjéből
  vagy a fájlnévből. Ez stabil kulcs az XML-hez (a fájl mozgatható).$$;

COMMENT ON COLUMN public.oblio_kiadas_match.local_file_relpath IS
  $$A helyi fájl relatív útvonala a KARTOTEKA helyi mappához képest
  (pl. "oblio-ellenorzes/2026/befogadott/4214783.xml").$$;

COMMENT ON COLUMN public.oblio_kiadas_match.match_method IS
  $$Hogy jött létre a párosítás:
    - auto_cui: a beszállító CUI matchelt + összeg/dátum tolerancián belül
    - auto_name_amount_date: nem volt CUI, csak név fuzzy + összeg + dátum
    - manual: a felhasználó kézzel rendelte hozzá$$;

-- Indexek
CREATE INDEX IF NOT EXISTS oblio_kiadas_match_kiadas_idx
  ON public.oblio_kiadas_match (congregation_id, kiadas_id);

CREATE INDEX IF NOT EXISTS oblio_kiadas_match_supplier_cui_idx
  ON public.oblio_kiadas_match (congregation_id, supplier_cui)
  WHERE supplier_cui IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. Az utolsó letöltés időpontja — ANAF 60 napos határidő figyelő
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.oblio_fiokok
  ADD COLUMN IF NOT EXISTS utolso_xml_letoltes_at timestamp with time zone;

COMMENT ON COLUMN public.oblio_fiokok.utolso_xml_letoltes_at IS
  $$Az utolsó alkalom, amikor a lelkész feldolgozott egy ZIP-et a helyi
  mappából (KARTOTEKA „Oblio ellenőrzés" fülön a „Frissítés" gomb).
  Az ANAF SPV csak 60 napra visszamenőleg engedi letölteni a számlákat,
  így a csengő-értesítés ezen alapul: 50/55/60 napos figyelmeztetés.$$;

-- ─────────────────────────────────────────────────────────────
-- 4. RLS — gyülekezeti scope-os hozzáférés
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.oblio_kiadas_match ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.oblio_kiadas_match TO authenticated;

DROP POLICY IF EXISTS oblio_kiadas_match_select ON public.oblio_kiadas_match;
CREATE POLICY oblio_kiadas_match_select ON public.oblio_kiadas_match
  FOR SELECT TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS oblio_kiadas_match_insert ON public.oblio_kiadas_match;
CREATE POLICY oblio_kiadas_match_insert ON public.oblio_kiadas_match
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS oblio_kiadas_match_update ON public.oblio_kiadas_match;
CREATE POLICY oblio_kiadas_match_update ON public.oblio_kiadas_match
  FOR UPDATE TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id))
  WITH CHECK (public.current_user_can_access_congregation(congregation_id));

DROP POLICY IF EXISTS oblio_kiadas_match_delete ON public.oblio_kiadas_match;
CREATE POLICY oblio_kiadas_match_delete ON public.oblio_kiadas_match
  FOR DELETE TO authenticated
  USING (public.current_user_can_access_congregation(congregation_id));

-- ─────────────────────────────────────────────────────────────
-- 5. RPC: az ANAF határidő státusz lekérdezése + automatikus
--    értesítés-beszúrás (idempotens)
-- ─────────────────────────────────────────────────────────────
--
-- Ha az utolso_xml_letoltes_at:
--   - >50 nap → 'warning' szintű 'oblio-spv-50' értesítés (1×)
--   - >55 nap → 'warning' szintű 'oblio-spv-55' (1×)
--   - >60 nap → 'danger' szintű 'oblio-spv-60' (1×)
--
-- Az értesítés-azonosító az `ertesitesek.megjegyzes` JSON tag-jében van
-- (kind: 'oblio-spv-XX'), így pontosan tudjuk, hogy már elküldtük-e.

CREATE OR REPLACE FUNCTION public.check_oblio_deadline_for_user()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_cong_id uuid;
  v_last_dl timestamp with time zone;
  v_days_since integer;
  v_kind text;
  v_already_sent boolean;
  v_severity text;
  v_title text;
  v_msg text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 'no_user');
  END IF;

  -- A felhasználó aktív gyülekezete (a `profiles.congregation_id` az
  -- alapérték; az effective override csak applikáció-szinten létezik,
  -- így az értesítés a profilra van kötve, nem a god-mode override-ra).
  SELECT congregation_id INTO v_cong_id
    FROM public.profiles WHERE id = v_user_id LIMIT 1;
  IF v_cong_id IS NULL THEN
    RETURN jsonb_build_object('status', 'no_congregation');
  END IF;

  -- Utolsó letöltés
  SELECT utolso_xml_letoltes_at INTO v_last_dl
    FROM public.oblio_fiokok
    WHERE congregation_id = v_cong_id AND aktiv = true
    LIMIT 1;

  IF v_last_dl IS NULL THEN
    RETURN jsonb_build_object('status', 'never_downloaded', 'congregation_id', v_cong_id);
  END IF;

  v_days_since := EXTRACT(EPOCH FROM (now() - v_last_dl))::integer / 86400;

  IF v_days_since < 50 THEN
    RETURN jsonb_build_object(
      'status', 'ok',
      'days_since', v_days_since,
      'days_remaining', 60 - v_days_since
    );
  END IF;

  -- Eldöntjük melyik kategória
  IF v_days_since >= 60 THEN
    v_kind := 'oblio-spv-60';
    v_severity := 'danger';
    v_title := 'Lejárt az ANAF SPV letöltési határidő!';
    v_msg := format(
      'Több mint 60 nap telt el az utolsó Oblio ellenőrzés-letöltés óta (%s nap). '
      'Az ANAF SPV csak 60 napra visszamenőleg adja vissza a befogadott számlákat. '
      'Az ennél régebbi számlák már nem tölthetők le közvetlenül — a beszállítótól kell elkérned.',
      v_days_since
    );
  ELSIF v_days_since >= 55 THEN
    v_kind := 'oblio-spv-55';
    v_severity := 'warning';
    v_title := 'Sürgős: ANAF SPV letöltés esedékes';
    v_msg := format(
      '%s nap telt el az utolsó Oblio ellenőrzés-letöltés óta — már csak %s nap van hátra. '
      'Töltsd le az új ZIP-et az Oblio Wallet-ből, és tedd a KARTOTEKA helyi mappájába!',
      v_days_since, 60 - v_days_since
    );
  ELSE  -- 50-54 között
    v_kind := 'oblio-spv-50';
    v_severity := 'warning';
    v_title := 'Közeledik az ANAF SPV határidő';
    v_msg := format(
      '%s nap telt el az utolsó Oblio ellenőrzés-letöltés óta — még %s nap van a 60 napos határidőig. '
      'Érdemes hamarosan letölteni egy friss ZIP-et az Oblio Wallet-ből.',
      v_days_since, 60 - v_days_since
    );
  END IF;

  -- Idempotencia ellenőrzés: küldtünk-e már ilyen `kind`-os értesítést a
  -- legutóbbi letöltés óta?
  SELECT EXISTS (
    SELECT 1 FROM public.ertesitesek
    WHERE user_id = v_user_id
      AND megjegyzes::jsonb ->> 'kind' = v_kind
      AND created_at >= v_last_dl
  ) INTO v_already_sent;

  IF v_already_sent THEN
    RETURN jsonb_build_object(
      'status', 'already_notified',
      'kind', v_kind,
      'days_since', v_days_since
    );
  END IF;

  -- Értesítés beszúrás
  INSERT INTO public.ertesitesek (user_id, tipus, cim, uzenet, olvasva, megjegyzes)
  VALUES (
    v_user_id,
    v_severity,
    v_title,
    v_msg,
    false,
    jsonb_build_object(
      'kind', v_kind,
      'congregation_id', v_cong_id,
      'last_download_at', v_last_dl,
      'days_since', v_days_since
    )::text
  );

  RETURN jsonb_build_object(
    'status', 'notified',
    'kind', v_kind,
    'severity', v_severity,
    'days_since', v_days_since
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_oblio_deadline_for_user() TO authenticated;

COMMENT ON FUNCTION public.check_oblio_deadline_for_user() IS
  $$Az aktuális felhasználó aktív gyülekezetéhez ellenőrzi az ANAF SPV
  60 napos letöltési határidőt. Ha közeledik (50/55/60 nap), idempotens
  módon értesítést szúr be a csengőhöz. Hívni a Pénzügy oldal load-jakor.$$;

COMMIT;


-- ============================================================================
-- ELLENŐRZŐK
-- ============================================================================

-- A) kiadas új oszlop
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'kiadas'
  AND column_name = 'kedvezmenyezett_cui';

-- B) oblio_kiadas_match létezik
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'oblio_kiadas_match';

-- C) RLS aktív + GRANT
SELECT relname, relrowsecurity FROM pg_class
WHERE relname = 'oblio_kiadas_match';

-- D) RPC létezik
SELECT proname, pronargs FROM pg_proc
WHERE proname = 'check_oblio_deadline_for_user';

-- E) Új oblio_fiokok mező
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'oblio_fiokok'
  AND column_name = 'utolso_xml_letoltes_at';
