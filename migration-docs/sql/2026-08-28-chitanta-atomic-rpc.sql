-- ═══════════════════════════════════════════════════════════════════════════
-- CHITANȚĂ ATOMIKUS KIÁLLÍTÁS — issue_chitanta_atomic RPC (P0-12)
-- 2026-08-28 — a pénzügyi átvilágítás A-blokkja
--
-- MIÉRT:
--   A nyugta-kiállítás eddig KÉT lépésben futott:
--     1. next_chitanta_full RPC — megnöveli a tömb-számlálót (felhasznalt_darabszam)
--     2. KÜLÖN kliens-oldali INSERT az oblio_szamlak-ba
--   Három hiba egyszerre:
--     (a) ha a 2. lépés elhasal (hálózat, RLS, constraint), a nyomdai szám
--         ELÉGETT — a fizikai papírtömbben nyomtatott sorszám marad
--         bizonylat nélkül (lyuk a szigorú számadású tömbben);
--     (b) a foglaló SELECT-ben nincs FOR UPDATE — két párhuzamos kiállítás
--         ugyanazt a felhasznalt_darabszam-ot olvassa → UGYANAZ a nyomdai szám
--         két nyugtán;
--     (c) dupla-kattintásra két nyugta készülhet ugyanarra a befizetésre.
--
-- MIT CSINÁL:
--   Új issue_chitanta_atomic() függvény: hatókör-kapu (BETŰRE a 2026-08-11-es
--   next_chitanta_full kapuja) → idempotencia-kapu → tömb-sor zárolása
--   FOR UPDATE-tel → idempotencia-kapu MEGISMÉTELVE a zár mögött (a
--   párhuzamos dupla-katt is fennakad) → számítás → számláló-növelés →
--   oblio_szamlak INSERT — MINDEZ EGY tranzakcióban. Bármelyik lépés hibája
--   MINDENT visszagörget: se elégetett szám, se féloldalas állapot.
--
-- MIT NEM CSINÁL:
--   - A régi next_chitanta_full és next_chitanta_number MARAD (nem hívja
--     őket az app a kód-váltás után, de nem törlünk).
--   - Meglévő adatot NEM ír át, nem olvas át más gyülekezetből.
--
-- SORREND (FONTOS): ez az SQL fusson le ELŐBB, és csak UTÁNA mehet ki a
--   kód-deploy (a web/desktop az új RPC-t hívja — enélkül hibát adna).
--   Fordítva viszont veszélytelen: a régi kód nem hívja az új függvényt.
--
-- FUTTATÁS: Supabase SQL editor, egyben. Újrafuttatható (CREATE OR REPLACE).
-- Az ellenőrző rács a fájl VÉGÉN, EGY eredményrácsban (UNION ALL).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.issue_chitanta_atomic(
  p_congregation_id uuid,
  p_befizetes_id bigint,
  p_szamla_datum date,
  p_klienesseg_nev text,
  p_klienesseg_cim text DEFAULT NULL,
  p_klienesseg_cui text DEFAULT NULL,
  p_osszeg numeric DEFAULT 0,
  p_reprezentand text DEFAULT NULL,
  p_reprezentand_ro text DEFAULT NULL
) RETURNS TABLE (
  chitanta_id uuid,
  tomb_id uuid,
  nyomdai_szam integer,
  gyulekezeti_szam integer,
  sorozat text,
  maradek integer,
  mar_letezett boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $chitanta_atomic$
#variable_conflict use_column
DECLARE
  v_tomb_id uuid;
  v_sorozat text;
  v_szam_kezdet integer;
  v_felhasznalt integer;
  v_darabszam integer;
  v_nyomdai integer;
  v_gyul integer;
  v_year integer;
  v_chitanta_id uuid;
  v_letezo record;
BEGIN
  -- 0/a. Fail-closed kapu — bejelentkezés + aktív tisztségviselő
  --      (BETŰRE a 2026-08-11-es next_chitanta_full kapuja)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nincs bejelentkezett felhasználó — nyugta nem állítható ki.';
  END IF;

  IF NOT public.current_user_is_active_staff() THEN
    RAISE EXCEPTION 'Nincs jogosultság a nyugta-kiállításhoz (a fiók nem aktív tisztségviselő).';
  END IF;

  -- 0/b. Hatókör-ellenőrzés — MIELŐTT bármit ÍRNÁNK
  IF NOT public.current_user_can_access_congregation(p_congregation_id) THEN
    RAISE EXCEPTION 'Nincs jogosultság a congregation_id=% -hoz', p_congregation_id;
  END IF;

  IF p_befizetes_id IS NULL OR p_befizetes_id <= 0 THEN
    RAISE EXCEPTION 'Hiányzó vagy érvénytelen befizetés-azonosító.';
  END IF;
  IF p_klienesseg_nev IS NULL OR btrim(p_klienesseg_nev) = '' THEN
    RAISE EXCEPTION 'Hiányzó befizető-név.';
  END IF;

  -- 1. Idempotencia-kapu (gyors út, zár nélkül): ha a befizetéshez már van
  --    élő nyugta, AZT adjuk vissza — nem égetünk új számot.
  SELECT os.id, os.tomb_id, COALESCE(os.nyomdai_szam, os.szam) AS nyomdai,
         os.gyulekezeti_szam, os.sorozat
    INTO v_letezo
    FROM public.oblio_szamlak os
    WHERE os.congregation_id = p_congregation_id
      AND os.befizetes_id = p_befizetes_id
      AND os.tipus = 'chitanta_papir'
      AND os.stornozott = false
    ORDER BY os.created_at ASC
    LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_letezo.id, v_letezo.tomb_id, v_letezo.nyomdai,
      v_letezo.gyulekezeti_szam, v_letezo.sorozat, NULL::integer, true;
    RETURN;
  END IF;

  -- 2. Aktív, nem-kifogyott tömb ZÁROLÁSA (legkisebb szám_kezdet először).
  --    A FOR UPDATE sorosítja a párhuzamos kiállításokat — két tranzakció
  --    nem olvashatja ugyanazt a felhasznalt_darabszam-ot.
  SELECT ct.id, ct.seria, ct.szam_kezdet, ct.felhasznalt_darabszam, ct.darabszam_ossz
    INTO v_tomb_id, v_sorozat, v_szam_kezdet, v_felhasznalt, v_darabszam
    FROM public.chitanta_tombok ct
    WHERE ct.congregation_id = p_congregation_id
      AND ct.aktiv = true
      AND ct.felhasznalt_darabszam < ct.darabszam_ossz
    ORDER BY ct.szam_kezdet ASC
    LIMIT 1
    FOR UPDATE;

  IF v_tomb_id IS NULL THEN
    RAISE EXCEPTION 'no_active_block' USING
      HINT = 'Nincs aktív nyugtatömb. A lelkész rögzítsen egy új tömböt a Nyugtatömbök oldalon.';
  END IF;

  -- 3. Idempotencia-kapu MEGISMÉTELVE a zár mögött: két párhuzamos
  --    kattintásnál a második itt várakozott — mire zárat kap, az első
  --    nyugtája már látszik, és azt adjuk vissza új szám égetése helyett.
  SELECT os.id, os.tomb_id, COALESCE(os.nyomdai_szam, os.szam) AS nyomdai,
         os.gyulekezeti_szam, os.sorozat
    INTO v_letezo
    FROM public.oblio_szamlak os
    WHERE os.congregation_id = p_congregation_id
      AND os.befizetes_id = p_befizetes_id
      AND os.tipus = 'chitanta_papir'
      AND os.stornozott = false
    ORDER BY os.created_at ASC
    LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_letezo.id, v_letezo.tomb_id, v_letezo.nyomdai,
      v_letezo.gyulekezeti_szam, v_letezo.sorozat, NULL::integer, true;
    RETURN;
  END IF;

  -- 4. Következő nyomdai szám a tömbből
  v_nyomdai := v_szam_kezdet + v_felhasznalt;

  -- 5. Gyülekezeti saját szám — év eleji újraindítás (a next_chitanta_full
  --    számítása változatlanul)
  v_year := EXTRACT(YEAR FROM p_szamla_datum);
  SELECT COALESCE(MAX(os.gyulekezeti_szam), 0) + 1
    INTO v_gyul
    FROM public.oblio_szamlak os
    WHERE os.congregation_id = p_congregation_id
      AND os.tipus = 'chitanta_papir'
      AND EXTRACT(YEAR FROM os.szamla_datum) = v_year
      AND os.stornozott = false;

  -- 6. Számláló-növelés (+ dátum frissítés) — a zárolt soron
  UPDATE public.chitanta_tombok ct
    SET felhasznalt_darabszam = ct.felhasznalt_darabszam + 1,
        elso_hasznalat_datum = COALESCE(ct.elso_hasznalat_datum, p_szamla_datum),
        utolso_hasznalat_datum = p_szamla_datum,
        aktiv = CASE WHEN ct.felhasznalt_darabszam + 1 >= ct.darabszam_ossz THEN false ELSE ct.aktiv END,
        updated_at = now()
    WHERE ct.id = v_tomb_id;

  -- 7. A nyugta-sor INSERT-je UGYANEBBEN a tranzakcióban — az oszloplista
  --    bit-azonos a korábbi kliens-oldali inserttel (web chitanta-actions.ts
  --    / core auto-issue-for-befizetes.ts). Ha ez elhasal, a 6. lépés
  --    számláló-növelése is visszagördül — nem ég el nyomdai szám.
  INSERT INTO public.oblio_szamlak (
    congregation_id, tipus, sorozat, szam, nyomdai_szam, gyulekezeti_szam,
    tomb_id, szamla_datum, klienesseg_nev, klienesseg_cim, klienesseg_cui,
    osszeg_net, osszeg_brut, osszeg_tva, reprezentand, reprezentand_ro,
    befizetes_id, issued_by
  ) VALUES (
    p_congregation_id, 'chitanta_papir', v_sorozat, v_nyomdai, v_nyomdai, v_gyul,
    v_tomb_id, p_szamla_datum, btrim(p_klienesseg_nev), p_klienesseg_cim, p_klienesseg_cui,
    COALESCE(p_osszeg, 0), COALESCE(p_osszeg, 0), 0, p_reprezentand, p_reprezentand_ro,
    p_befizetes_id, auth.uid()
  )
  RETURNING id INTO v_chitanta_id;

  -- 8. A lefoglalt + elmentett nyugta adatai
  RETURN QUERY SELECT v_chitanta_id, v_tomb_id, v_nyomdai, v_gyul, v_sorozat,
    (v_darabszam - v_felhasznalt - 1), false;
END;
$chitanta_atomic$;

COMMENT ON FUNCTION public.issue_chitanta_atomic(uuid, bigint, date, text, text, text, numeric, text, text) IS
  'Papír-chitanță kiállítás EGY tranzakcióban (P0-12, 2026-08-28): hatókör-kapu + idempotencia-kapu (zár előtt ÉS mögött) + FOR UPDATE a tömb-soron + számláló-növelés + oblio_szamlak INSERT. Hibánál MINDEN visszagördül — nem ég el nyomdai szám. A next_chitanta_full kétlépcsős útját váltja ki.';

REVOKE ALL ON FUNCTION public.issue_chitanta_atomic(uuid, bigint, date, text, text, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_chitanta_atomic(uuid, bigint, date, text, text, text, numeric, text, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- ELLENŐRZŐ RÁCS — EGY eredményrácsban (a Supabase editor csak az utolsót
-- mutatja). Minden sor „✅ …" vagy „⛔ …" kezdetű.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'issue_chitanta_atomic' AND p.prosecdef
  ) THEN '✅ 1. issue_chitanta_atomic létezik és SECURITY DEFINER'
    ELSE '⛔ 1. issue_chitanta_atomic HIÁNYZIK vagy nem SECURITY DEFINER' END AS ellenorzes
UNION ALL
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'issue_chitanta_atomic'
      AND p.prosrc LIKE '%FOR UPDATE%'
      AND p.prosrc LIKE '%INSERT INTO public.oblio_szamlak%'
  ) THEN '✅ 2. a törzsben FOR UPDATE + oblio_szamlak INSERT (egy tranzakció)'
    ELSE '⛔ 2. a törzsből HIÁNYZIK a FOR UPDATE vagy az INSERT' END
UNION ALL
SELECT
  CASE WHEN (
    SELECT length(p.prosrc) - length(replace(p.prosrc, 'stornozott = false', ''))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'issue_chitanta_atomic'
  ) >= 2 * length('stornozott = false')
  THEN '✅ 3. idempotencia-kapu a zár ELŐTT és MÖGÖTT is megvan'
  ELSE '⛔ 3. az idempotencia-kapu nincs meg kétszer' END
UNION ALL
SELECT
  CASE WHEN NOT has_function_privilege('anon',
    'public.issue_chitanta_atomic(uuid, bigint, date, text, text, text, numeric, text, text)', 'EXECUTE')
   AND has_function_privilege('authenticated',
    'public.issue_chitanta_atomic(uuid, bigint, date, text, text, text, numeric, text, text)', 'EXECUTE')
  THEN '✅ 4. jogosultság: anon NEM, authenticated IGEN futtathatja'
  ELSE '⛔ 4. a GRANT/REVOKE páros nem a várt állapotban' END
ORDER BY 1;
