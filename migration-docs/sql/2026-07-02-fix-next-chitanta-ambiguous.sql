-- =====================================================================
--  FIX: next_chitanta_full — "column reference gyulekezeti_szam is ambiguous"
--  Dátum: 2026-07-02
--  Tünet: Nyugtatömb-mentéskor (chitanță szám-lefoglalás) hiba:
--         „Szám-lefoglalási hiba: column reference "gyulekezeti_szam" is ambiguous"
--  Ok:    A függvény RETURNS TABLE (... gyulekezeti_szam integer ...) OUT-paramétere
--         ütközött az oblio_szamlak.gyulekezeti_szam OSZLOPPAL a MAX(...) hívásban.
--  Javítás: (1) #variable_conflict use_column direktíva (minősítetlen → oszlop nyer),
--           (2) az oblio_szamlak lekérdezés aliasolva (os.) — belt & suspenders.
--
--  Futtatás: Supabase SQL editor → Run. Idempotens (CREATE OR REPLACE).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.next_chitanta_full(
  p_congregation_id uuid,
  p_szamla_datum date DEFAULT CURRENT_DATE
) RETURNS TABLE (
  tomb_id uuid,
  nyomdai_szam integer,
  gyulekezeti_szam integer,
  sorozat text,
  maradek integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
BEGIN
  -- 1. Aktív, nem-kifogyott tömb keresése (legkisebb szám_kezdet először)
  SELECT ct.id, ct.seria, ct.szam_kezdet, ct.felhasznalt_darabszam, ct.darabszam_ossz
    INTO v_tomb_id, v_sorozat, v_szam_kezdet, v_felhasznalt, v_darabszam
    FROM public.chitanta_tombok ct
    WHERE ct.congregation_id = p_congregation_id
      AND ct.aktiv = true
      AND ct.felhasznalt_darabszam < ct.darabszam_ossz
    ORDER BY ct.szam_kezdet ASC
    LIMIT 1;

  IF v_tomb_id IS NULL THEN
    RAISE EXCEPTION 'no_active_block' USING
      HINT = 'Nincs aktív nyugtatömb. A lelkész rögzítsen egy új tömböt a Nyugtatömbök oldalon.';
  END IF;

  -- 2. Következő kerületi szám a tömbből
  v_nyomdai := v_szam_kezdet + v_felhasznalt;

  -- 3. Gyülekezeti saját szám — év eleji újraindítás (aliasolt oszlopok!)
  v_year := EXTRACT(YEAR FROM p_szamla_datum);
  SELECT COALESCE(MAX(os.gyulekezeti_szam), 0) + 1
    INTO v_gyul
    FROM public.oblio_szamlak os
    WHERE os.congregation_id = p_congregation_id
      AND os.tipus = 'chitanta_papir'
      AND EXTRACT(YEAR FROM os.szamla_datum) = v_year
      AND os.stornozott = false;

  -- 4. Felhasznalt_darabszam increment (+ dátum frissítés)
  UPDATE public.chitanta_tombok ct
    SET felhasznalt_darabszam = ct.felhasznalt_darabszam + 1,
        elso_hasznalat_datum = COALESCE(ct.elso_hasznalat_datum, p_szamla_datum),
        utolso_hasznalat_datum = p_szamla_datum,
        aktiv = CASE WHEN ct.felhasznalt_darabszam + 1 >= ct.darabszam_ossz THEN false ELSE ct.aktiv END,
        updated_at = now()
    WHERE ct.id = v_tomb_id;

  -- 5. Visszaadjuk a lefoglalt számokat
  RETURN QUERY SELECT v_tomb_id, v_nyomdai, v_gyul, v_sorozat, (v_darabszam - v_felhasznalt - 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_chitanta_full(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.next_chitanta_full(uuid, date) IS
  'Atomikus nyugtaszám-lefoglalás (2026-07-02 ambiguous-fix): aktív tömb → kerületi + gyülekezeti szám, felhasznált++.';
