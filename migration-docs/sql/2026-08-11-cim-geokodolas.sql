-- KARTOTEKA — Cím-egyeztetés a térképpel: tárolt pont a címtörzsön (2026-08-11)
-- Futtatja: Endre (Supabase SQL Editor). Egyben futtatható, idempotens.
--
-- ════════════════════════════════════════════════════════════════════════════
-- MI A BAJ
-- ════════════════════════════════════════════════════════════════════════════
-- A személyi karton „Útvonal" gombja a MAGYAR település- és utcanévből épített
-- Google Maps linket:
--       adrlocality.name  +  adrstreet.name  +  szemely.c_szam
-- A nyilvántartás SZÁNDÉKOSAN magyarul tárol (ez a gyülekezet nyelve), a
-- Google Térkép viszont a HIVATALOS ROMÁN névtörzsre geokódol:
--
--       „Barátos"  →  hivatalosan  Brateș   (Covasna megye)
--       „Főút"     →  hivatalosan  Strada Principală
--
-- Ezért kapta a lelkész szó szerint ezt a választ:
--       „A Google Térkép nem találja a következőt: Barátos, Főút, 144, România"
--
-- ════════════════════════════════════════════════════════════════════════════
-- MI TÖRTÉNT MÁR (alkalmazás-oldal) — EZ A FÁJL NÉLKÜL IS MŰKÖDIK
-- ════════════════════════════════════════════════════════════════════════════
-- A javítás nagyobbik fele NEM adatbázis-munka: a `_ro` oszlopok
-- (adrlocality.name_ro, adrstreet.name_ro, adrstreet.street_type_ro,
-- adrlocality.default_postalcode, adrcounty.name_ro) 2026-04-21 ÓTA LÉTEZNEK és
-- fel is vannak töltve (Poșta Română + GeoNames seed) — egyszerűen SENKI nem
-- olvasta őket a térkép-linkhez.
--
-- A `lib/members/directions.ts` mostantól a hivatalos alakot építi:
--       Strada Principală 144, Brateș, Covasna, 527065, România
-- és ez a fájl NÉLKÜL is él. A `getMemberDetails` cím-lekérdezése ellenálló:
-- ha az itt létrehozott `geo_*` oszlopok még nincsenek meg, a lekérdezés
-- MEGISMÉTLŐDIK nélkülük, és a karton hibátlanul működik tovább.
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIT AD HOZZÁ EZ A FÁJL — az „egyeztetés és lekérés"
-- ════════════════════════════════════════════════════════════════════════════
-- A tulajdonosi kérés: „Legyen valamilyen egyeztetés és lekérés, hogy biztosan
-- jól működjön!" — vagyis ha a hivatalos név sem elég (mert hiányzik, vagy a
-- falunak nincs utcaneve), a lelkész EGYSZER megerősíthesse a helyet, és
-- onnantól soha többé ne hibázzon.
--
-- A megerősítés eredménye egy KOORDINÁTA (és/vagy a pótolt hivatalos név),
-- amit a TELEPÜLÉS vagy az UTCA sorára tárolunk — NEM a személyre. Így egy
-- „Barátos → Brateș" egyeztetés EGYSZERRE javítja mindenkit, aki ott lakik.
-- Lekérdezéskor a koordinátához SEMMILYEN külső szolgáltatás nem kell (nincs
-- API-kulcs, nincs Nominatim, nincs hálózati függés), és soha nem jár le.
--
-- ┌── MIÉRT NEM A `needs_review` / `review_source` OSZLOPOKAT HASZNÁLJUK ─────┐
-- │ Azok 2026-04-26 óta MÁS jelentést hordoznak: „ez a sor importból jött,   │
-- │ ember nézze át", illetve „melyik importból". Egy térkép-egyeztetés nem    │
-- │ ugyanaz az állítás, és a két jelentés összemosása némán elrontaná az      │
-- │ import-felülvizsgáló listát. Ezért kapnak dedikált oszlopot, a régieket   │
-- │ pedig NEM írjuk felül.                                                    │
-- └───────────────────────────────────────────────────────────────────────────┘
--
-- ⚠️ AZ `adrlocality` / `adrstreet` KÖZÖS, ORSZÁGOS TÖRZSADAT. Az
--    `authenticated` szerepnek csak SELECT-grantja van rá
--    (2026-04-21-adr-grant-authenticated.sql), írni kizárólag guardolt
--    SECURITY DEFINER RPC-n át lehet — ugyanaz a minta, mint az
--    `app_get_or_create_locality`-nál (2026-06-10-tagnyilvantartas-fazis1-
--    biztonsag.sql). Az RPC ráadásul azt is megköveteli, hogy a hívó
--    gyülekezete TÉNYLEGESEN használja az adott települést/utcát — így egy
--    lelkész nem tud olyan referencia-sort elrontani, amihez semmi köze.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. OSZLOPOK — az egyeztetett pont a címtörzsön
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.adrlocality
  ADD COLUMN IF NOT EXISTS geo_lat         numeric(9,6),
  ADD COLUMN IF NOT EXISTS geo_lng         numeric(9,6),
  ADD COLUMN IF NOT EXISTS geo_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS geo_verified_by uuid;

ALTER TABLE public.adrstreet
  ADD COLUMN IF NOT EXISTS geo_lat         numeric(9,6),
  ADD COLUMN IF NOT EXISTS geo_lng         numeric(9,6),
  ADD COLUMN IF NOT EXISTS geo_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS geo_verified_by uuid;

COMMENT ON COLUMN public.adrlocality.geo_lat IS
  '2026-08-11: a lelkész által a térképen megerősített pont szélessége. Ha ki van töltve, az útvonal EZT használja — külső geokódoló nélkül.';
COMMENT ON COLUMN public.adrlocality.geo_lng IS
  '2026-08-11: a megerősített pont hosszúsága (lásd geo_lat).';
COMMENT ON COLUMN public.adrlocality.geo_verified_at IS
  '2026-08-11: mikor erősítette meg valaki a pontot. NULL = még nincs egyeztetve (a karton ilyenkor figyelmeztet).';
COMMENT ON COLUMN public.adrstreet.geo_lat IS
  '2026-08-11: az utca megerősített pontja. Pontosabb a településinél, ezért az útvonal ezt választja először.';

-- Tartomány-őrszem. `ADD CONSTRAINT IF NOT EXISTS` nincs a Postgresben, ezért
-- a katalógusból nézzük meg — így a fájl többször is lefuttatható.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'adrlocality_geo_range_chk') THEN
    ALTER TABLE public.adrlocality ADD CONSTRAINT adrlocality_geo_range_chk CHECK (
      (geo_lat IS NULL AND geo_lng IS NULL)
      OR (geo_lat BETWEEN -90 AND 90 AND geo_lng BETWEEN -180 AND 180)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'adrstreet_geo_range_chk') THEN
    ALTER TABLE public.adrstreet ADD CONSTRAINT adrstreet_geo_range_chk CHECK (
      (geo_lat IS NULL AND geo_lng IS NULL)
      OR (geo_lat BETWEEN -90 AND 90 AND geo_lng BETWEEN -180 AND 180)
    );
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. AZ EGYEZTETÉST MENTŐ RPC
-- ────────────────────────────────────────────────────────────────────────────
-- Bemenet:
--   p_scope    'locality' vagy 'street'
--   p_id       adrlocality.id vagy adrstreet.id
--   p_lat/lng  a megerősített pont (elhagyható, ha csak a nevet pótoljuk)
--   p_name_ro  a hivatalos román név pótlása — MEGLÉVŐT NEM ÍR FELÜL
-- Kimenet: jsonb { ok, szint, id, pont_frissult, nev_frissult }
--
-- ⚠️ A `name` (magyar, nyilvántartási) oszlophoz EZ A FÜGGVÉNY SOHA NEM NYÚL.
--    Az a gyülekezet nyelve; a román alak a párja, nem a helyettesítője.

CREATE OR REPLACE FUNCTION public.app_set_address_geo(
  p_scope   text,
  p_id      integer,
  p_lat     numeric DEFAULT NULL,
  p_lng     numeric DEFAULT NULL,
  p_name_ro text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_congregation_id uuid;
  v_global          boolean;
  v_in_use          boolean := false;
  v_name_ro         text;
  v_has_point       boolean;
  v_name_updated    boolean := false;
  v_point_updated   boolean := false;
BEGIN
  -- ── Kapu 1: bejelentkezés + aktív gyülekezeti hozzáférés ──────────────────
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Bejelentkezés szükséges.';
  END IF;

  v_global          := public.current_user_has_global_access();
  v_congregation_id := public.current_user_congregation_id();

  IF NOT (v_global OR v_congregation_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Nincs aktív gyülekezeti tagság.';
  END IF;

  IF p_scope NOT IN ('locality', 'street') THEN
    RAISE EXCEPTION 'Ismeretlen egyeztetési szint: %', p_scope;
  END IF;
  IF p_id IS NULL OR p_id <= 0 THEN
    RAISE EXCEPTION 'Hiányzik a település/utca azonosítója.';
  END IF;

  v_name_ro   := nullif(btrim(coalesce(p_name_ro, '')), '');
  v_has_point := (p_lat IS NOT NULL AND p_lng IS NOT NULL);

  IF NOT v_has_point AND v_name_ro IS NULL THEN
    RAISE EXCEPTION 'Adj meg legalább egy térkép-pontot vagy a hivatalos román nevet.';
  END IF;
  IF v_has_point AND (p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180) THEN
    RAISE EXCEPTION 'A megadott koordináta érvénytelen.';
  END IF;
  IF v_name_ro IS NOT NULL AND length(v_name_ro) > 120 THEN
    RAISE EXCEPTION 'A hivatalos név túl hosszú (legfeljebb 120 karakter).';
  END IF;

  -- ── Kapu 2: a hívó gyülekezete TÉNYLEG használja-e ezt a sort? ────────────
  -- Országos törzsadat: e nélkül bárki bármelyik romániai utcát elronthatná.
  IF v_global THEN
    v_in_use := true;
  ELSIF p_scope = 'locality' THEN
    v_in_use :=
      EXISTS (SELECT 1 FROM public.szemely s
              WHERE s.c_helysegid = p_id AND s.congregation_id = v_congregation_id)
      OR EXISTS (SELECT 1 FROM public.congregations c
                 WHERE c.id = v_congregation_id AND c.adrlocality_id = p_id)
      OR EXISTS (SELECT 1 FROM public.szemely s
                 JOIN public.adrstreet st ON st.id = s.c_utcaid
                 WHERE st.localityid = p_id AND s.congregation_id = v_congregation_id);
  ELSE
    v_in_use :=
      EXISTS (SELECT 1 FROM public.szemely s
              WHERE s.c_utcaid = p_id AND s.congregation_id = v_congregation_id)
      OR EXISTS (SELECT 1 FROM public.congregations c
                 WHERE c.id = v_congregation_id AND c.adrstreet_id = p_id);
  END IF;

  IF NOT v_in_use THEN
    RAISE EXCEPTION 'Ezt a települést/utcát a gyülekezeted nem használja, ezért nem egyeztethető innen.';
  END IF;

  -- ── Írás ──────────────────────────────────────────────────────────────────
  IF p_scope = 'locality' THEN
    IF v_name_ro IS NOT NULL THEN
      UPDATE public.adrlocality
      SET name_ro = v_name_ro
      WHERE id = p_id AND nullif(btrim(coalesce(name_ro, '')), '') IS NULL;
      v_name_updated := FOUND;
    END IF;

    IF v_has_point THEN
      UPDATE public.adrlocality
      SET geo_lat = p_lat, geo_lng = p_lng,
          geo_verified_at = now(), geo_verified_by = auth.uid()
      WHERE id = p_id;
      v_point_updated := FOUND;
      IF NOT v_point_updated THEN
        RAISE EXCEPTION 'Nincs ilyen település a címtörzsben (id=%).', p_id;
      END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM public.adrlocality WHERE id = p_id) THEN
      RAISE EXCEPTION 'Nincs ilyen település a címtörzsben (id=%).', p_id;
    END IF;
  ELSE
    IF v_name_ro IS NOT NULL THEN
      UPDATE public.adrstreet
      SET name_ro = v_name_ro
      WHERE id = p_id AND nullif(btrim(coalesce(name_ro, '')), '') IS NULL;
      v_name_updated := FOUND;
    END IF;

    IF v_has_point THEN
      UPDATE public.adrstreet
      SET geo_lat = p_lat, geo_lng = p_lng,
          geo_verified_at = now(), geo_verified_by = auth.uid()
      WHERE id = p_id;
      v_point_updated := FOUND;
      IF NOT v_point_updated THEN
        RAISE EXCEPTION 'Nincs ilyen utca a címtörzsben (id=%).', p_id;
      END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM public.adrstreet WHERE id = p_id) THEN
      RAISE EXCEPTION 'Nincs ilyen utca a címtörzsben (id=%).', p_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'szint', p_scope,
    'id', p_id,
    'pont_frissult', v_point_updated,
    -- false = a hivatalos név MÁR ki volt töltve, ezért nem írtuk felül
    'nev_frissult', CASE WHEN v_name_ro IS NULL THEN NULL ELSE v_name_updated END
  );
END;
$$;

COMMENT ON FUNCTION public.app_set_address_geo(text, integer, numeric, numeric, text) IS
  '2026-08-11: a személyi karton „Cím egyeztetése" ablakának mentője. A lelkész által a térképen megerősített pontot (és a hiányzó hivatalos román nevet) a TELEPÜLÉS/UTCA sorára írja, így egy egyeztetés minden ott lakó tagot javít. Guardolt: bejelentkezés + a hívó gyülekezete tényleg használja az adott sort. A magyar `name` oszlophoz nem nyúl, meglévő `name_ro`-t nem ír felül.';

REVOKE ALL ON FUNCTION public.app_set_address_geo(text, integer, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_set_address_geo(text, integer, numeric, numeric, text) TO authenticated;

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
         'adrlocality.geo_lat oszlop letezik'::text AS mit_mer,
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'adrlocality'
                   AND column_name = 'geo_lat')::text AS ertek,
         'true'::text AS vart

  UNION ALL SELECT 2, 'adrlocality.geo_verified_at oszlop letezik',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'adrlocality'
                   AND column_name = 'geo_verified_at')::text, 'true'

  UNION ALL SELECT 3, 'adrstreet.geo_lat oszlop letezik',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'adrstreet'
                   AND column_name = 'geo_lat')::text, 'true'

  UNION ALL SELECT 4, 'Mindket tartomany-CHECK a helyen van',
         (SELECT count(*)::text FROM pg_constraint
          WHERE conname IN ('adrlocality_geo_range_chk', 'adrstreet_geo_range_chk')), '2'

  UNION ALL SELECT 5, 'app_set_address_geo fuggveny letezik',
         EXISTS (SELECT 1 FROM pg_proc p
                 JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'app_set_address_geo')::text, 'true'

  UNION ALL SELECT 6, 'SECURITY DEFINER + rogzitett search_path',
         COALESCE((SELECT (p.prosecdef AND array_to_string(p.proconfig, ',') LIKE '%search_path%')::text
                   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = 'app_set_address_geo'), 'nincs fuggveny'), 'true'

  UNION ALL SELECT 7, 'authenticated futtathatja',
         COALESCE((SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = 'app_set_address_geo'), 'nincs fuggveny'), 'true'

  UNION ALL SELECT 8, 'PUBLIC NEM futtathatja',
         COALESCE((SELECT has_function_privilege('public', p.oid, 'EXECUTE')::text
                   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = 'app_set_address_geo'), 'nincs fuggveny'), 'false'

  UNION ALL SELECT 9, 'A ket guard-helper letezik (current_user_*)',
         (SELECT count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname IN ('current_user_has_global_access', 'current_user_congregation_id')), '2'

  UNION ALL SELECT 10, 'adrlocality iras tovabbra is CSAK RPC-n (nincs UPDATE-grant)',
         has_table_privilege('authenticated', 'public.adrlocality', 'UPDATE')::text, 'false'
) x
ORDER BY x.sorrend;

-- ════════════════════════════════════════════════════════════════════════════
-- FÜST-TESZT (a futtatás után, az alkalmazásban)
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Nyisd meg egy barátosi tag SZEMÉLYI KARTONJÁT. Az „Elérhetőségek" alatt
--    megjelenik: „A térkép ezt keresi: …". Ha a hivatalos név megvan, itt már
--    „Strada Principală 144, Brateș, Covasna, 527065, România" alakú sort látsz.
-- 2. Koppints az „Útvonal" gombra — a Google Térképnek meg kell találnia.
-- 3. Ha mégsem: koppints a „Cím egyeztetése" gombra → „Megnyitom a térképen" →
--    keresd meg a házat → nyomd hosszan → másold be a számpárt → „Egyeztetés
--    mentése". A sáv azonnal zöldre vált: „Ez a cím egyeztetve van a térképpel."
-- 4. Nyisd meg egy MÁSIK, ugyanabban az utcában lakó tag kartonját: annak is
--    egyeztetettnek kell lennie — az egyeztetés a címtörzsre ment, nem a
--    személyre.
-- 5. Ha az „Egyeztetés mentése" azt írja, hogy „a gyülekezeted nem használja",
--    akkor a tag címe nem a címtörzsből választott sorra mutat: nyisd meg a tag
--    szerkesztőjét, és válaszd ki a települést/utcát a listából.
-- 6. Ha a 10. ellenőrző sor nem `false`: valaki UPDATE-grantot adott az
--    `adrlocality`-ra — küldd vissza az eredményt, mert akkor az országos
--    törzsadat RPC megkerülésével is írható.
