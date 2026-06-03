-- ============================================================================
-- 2026-06-03 — Királyhágómelléki Református Egyházkerület + 9 egyházmegye seed
-- ============================================================================
-- FORRÁS: a felhasználó (Szőcs Endre) frissített seed-táblája
--   `dioceses-congregations-seed-2026-04-30-frissitett.xlsx`
--   → „Királyhágói egyházmegyék" munkalap.
--   Keresztellenőrizve: hu.wikipedia.org + krek.ro/cimtar.php (2026-06-03) —
--   mindkettő ugyanazt a 9 egyházmegyét adja.
--
-- CÉL: a regisztrációs (hozzáférés-kérő) űrlapon az egyházkerület + egyházmegye
--   választó immár DB-ből töltődik. Az Erdélyi egyházkerület + 15 egyházmegyéje
--   már korábban seedelve lett (2026-04-30-dioceses-seed.sql). Itt a második
--   egyházkerületet és annak 9 egyházmegyéjét adjuk hozzá.
--
-- IDEMPOTENS: `WHERE NOT EXISTS` minta védi a beszúrásokat (a `name`-en nincs
--   UNIQUE constraint), így biztonsággal újrafuttatható.
--
-- FUTTATÁS: Supabase Dashboard → SQL Editor → teljes fájl → Run.
-- ============================================================================

BEGIN;

-- ── 1. District — Királyhágómelléki Református Egyházkerület ─────────────────

INSERT INTO public.districts (id, name, created_at)
SELECT gen_random_uuid(), 'Királyhágómelléki Református Egyházkerület', now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.districts WHERE name = 'Királyhágómelléki Református Egyházkerület'
);

-- ── 2. Dioceses — 9 királyhágómelléki egyházmegye (esperes-nevekkel) ─────────

DO $$
DECLARE
  v_district_id uuid;
  v_kerulet text := 'Királyhágómelléki Református Egyházkerület';
  -- {egyházmegye név, esperes név}
  v_rows text[][] := ARRAY[
    ['Nagybányai Református Egyházmegye',      'Gellén Sándor Károly'],
    ['Szatmári Református Egyházmegye',        'Király Lajos'],
    ['Nagykárolyi Református Egyházmegye',     'Tolnay István'],
    ['Érmelléki Református Egyházmegye',       'Bara László'],
    ['Bihari Református Egyházmegye',          'Filep Attila Csaba'],
    ['Aradi Református Egyházmegye',           'Tóbiás Tibor'],
    ['Temesvári Református Egyházmegye',       'Bódis Ferenc'],
    ['Szilágysomlyói Református Egyházmegye',  'Bogdán Szabolcs'],
    ['Zilahi Református Egyházmegye',          'Kádár György Tamás']
  ];
  i int;
  v_nev text;
  v_esperes text;
BEGIN
  SELECT id INTO v_district_id
  FROM public.districts
  WHERE name = v_kerulet
  LIMIT 1;

  IF v_district_id IS NULL THEN
    RAISE EXCEPTION 'Nem találtuk a districts rekordot: %', v_kerulet;
  END IF;

  FOR i IN 1 .. array_length(v_rows, 1) LOOP
    v_nev := v_rows[i][1];
    v_esperes := v_rows[i][2];

    INSERT INTO public.dioceses (
      id, district_id, name, esperes_nev,
      cim_orszag, weboldal, created_at, updated_at
    )
    SELECT
      gen_random_uuid(), v_district_id, v_nev, v_esperes,
      'Románia', 'https://www.krek.ro', now(), now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.dioceses
      WHERE name = v_nev AND district_id = v_district_id
    );
  END LOOP;
END $$;

COMMIT;

-- ── ELLENŐRZÉS ──────────────────────────────────────────────────────────────

-- Mindkét egyházkerület + egyházmegye-darabszám (várt: Erdélyi 15, Királyhágó 9)
SELECT
  dt.name AS egyhazkerulet,
  COUNT(d.id) AS egyhazmegyek_szama
FROM public.districts dt
LEFT JOIN public.dioceses d ON d.district_id = dt.id
WHERE dt.name LIKE '%Egyházkerület'
GROUP BY dt.name
ORDER BY dt.name;

-- A 9 királyhágómelléki egyházmegye
SELECT d.name AS egyhazmegye, d.esperes_nev
FROM public.dioceses d
JOIN public.districts dt ON d.district_id = dt.id
WHERE dt.name = 'Királyhágómelléki Református Egyházkerület'
ORDER BY d.name;
