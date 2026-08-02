-- ============================================================================
-- PR-21 (2026-08-02) — ROKONSÁGI ÉLEK EGYSZERI JAVÍTÁSA + RPC-FOLT
--
-- Háttér (user-hiba): a családkártya-javítás után a RÉGI (rossz) házastárs-él
-- aktív maradt, mert a 'fazis1-backfill' eredetű éleket a lezáró logika nem
-- ismerte → a családfa két házastársat + hármas gyerek-sávot rajzolt.
--
-- MIT CSINÁL:
--   1. LEZÁRJA az összes olyan aktív, TAGSÁG-EREDETŰ élt (haztartas-sync /
--      sync_households_from_csalad / fazis1-backfill), amelyet a JELENLEGI
--      család-állapot már nem igazol. A lezárás jelölése
--      'csalad-szerkesztes-eltavolitas' — ha a tagságot később visszaállítod,
--      az él magától újranyílik. A NULL megjegyzésű (anyakönyvi/keresztelési/
--      CNP-s) éleket NEM érinti.
--   2. BEFOLTOZZA a sync_households_from_csalad RPC-t: csak AKTÍV családból
--      dolgozik, és lezárt élt nem szúr be újra (a régi ON CONFLICT ezt nem
--      védte) — különben a következő import újratermelné a szemetet.
--   3. VERIFIKÁCIÓ: megmaradt ellentmondások (ezek anyakönyvi/kézi eredetűek,
--      a felületen a családfa figyelmeztető sávja is mutatja őket) + a
--      duplikált személyek listája.
--
-- Futtatás: Supabase SQL Editor, az EGÉSZ fájl kijelölés nélkül. Idempotens.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1/a. Árva HÁZASTÁRS-élek lezárása (nincs aktív közös család)
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.szemely_kapcsolat k
SET ervenyes_ig = CURRENT_DATE,
    megjegyzes = 'csalad-szerkesztes-eltavolitas'
WHERE k.tipus = 'hazastars'
  AND k.ervenyes_ig IS NULL
  AND k.megjegyzes IN ('haztartas-sync', 'sync_households_from_csalad', 'fazis1-backfill')
  AND NOT EXISTS (
    SELECT 1 FROM public.csalad c
    WHERE c.isaktiv = true
      AND ((c.id_ferfi = k.id_szemely_1 AND c.id_no = k.id_szemely_2)
        OR (c.id_ferfi = k.id_szemely_2 AND c.id_no = k.id_szemely_1))
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 1/b. Árva SZÜLŐ-GYEREK élek lezárása (a gyermek már nincs a szülő aktív
--      családjában)
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.szemely_kapcsolat k
SET ervenyes_ig = CURRENT_DATE,
    megjegyzes = 'csalad-szerkesztes-eltavolitas'
WHERE k.tipus = 'szulo_gyermek'
  AND k.ervenyes_ig IS NULL
  AND k.megjegyzes IN ('haztartas-sync', 'sync_households_from_csalad', 'fazis1-backfill')
  AND NOT EXISTS (
    SELECT 1 FROM public.gyerek g
    JOIN public.csalad c ON c.id = g.id_csalad AND c.isaktiv = true
    WHERE g.id_szemely = k.id_szemely_2
      AND (c.id_ferfi = k.id_szemely_1 OR c.id_no = k.id_szemely_1)
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 2. RPC-FOLT: sync_households_from_csalad v3 — csak aktív család, lezárt él
--    nem támad fel, fordított irányú házastárs-dupla sem jön létre
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_households_from_csalad(p_congregation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '120s'
AS $$
DECLARE
  v_rec record;
  v_cim_id public.cim.id%TYPE;
  v_created_haztartas int := 0;
  v_created_tag int := 0;
  v_created_kapcsolat int := 0;
  v_cnt int;
BEGIN
  IF NOT public.current_user_can_access_congregation(p_congregation_id) THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  -- 2/a) Hiányzó cim + haztartas létrehozása (változatlan a v2-höz képest)
  FOR v_rec IN
    SELECT c.id AS csalad_id,
           c.c_utcaid, c.c_szam, c.c_tombhaz, c.c_lepcsohaz, c.c_emelet, c.c_ajto,
           c.id_csoport, c.isaktiv,
           COALESCE(sf.csaladnev, sn.csaladnev, '?') AS fej_nev,
           a.name AS utca_nev
    FROM public.csalad c
    LEFT JOIN public.szemely sf ON sf.id = c.id_ferfi
    LEFT JOIN public.szemely sn ON sn.id = c.id_no
    LEFT JOIN public.adrstreet a ON a.id = c.c_utcaid
    WHERE COALESCE(sf.congregation_id, sn.congregation_id) = p_congregation_id
      AND NOT EXISTS (SELECT 1 FROM public.haztartas h WHERE h.legacy_csalad_id = c.id)
  LOOP
    INSERT INTO public.cim (
      congregation_id, id_utca, szam, tombhaz, lepcsohaz, emelet, ajto,
      tipus, megjegyzes
    ) VALUES (
      p_congregation_id, v_rec.c_utcaid, v_rec.c_szam, v_rec.c_tombhaz,
      v_rec.c_lepcsohaz, v_rec.c_emelet, v_rec.c_ajto,
      'otthon', 'sync_households_from_csalad'
    ) RETURNING id INTO v_cim_id;

    INSERT INTO public.haztartas (
      congregation_id, megnevezes, id_cim, id_csoport, isaktiv,
      legacy_csalad_id, ervenyes_tol
    ) VALUES (
      p_congregation_id,
      CONCAT(
        v_rec.fej_nev, ' család',
        CASE WHEN v_rec.utca_nev IS NOT NULL
             THEN CONCAT(' — ', v_rec.utca_nev,
                         CASE WHEN v_rec.c_szam IS NOT NULL AND v_rec.c_szam <> ''
                              THEN CONCAT(' ', v_rec.c_szam) ELSE '' END)
             ELSE '' END
      ),
      v_cim_id, v_rec.id_csoport, COALESCE(v_rec.isaktiv, true),
      v_rec.csalad_id, CURRENT_DATE
    );
    v_created_haztartas := v_created_haztartas + 1;
  END LOOP;

  -- 2/b) haztartas_tag — férj (v3: csak AKTÍV csalad + NYITOTT haztartas)
  WITH ins AS (
    INSERT INTO public.haztartas_tag (id_haztartas, id_szemely, szerep, is_primary, ervenyes_tol, congregation_id)
    SELECT h.id, c.id_ferfi, 'csaladfo', true, CURRENT_DATE, h.congregation_id
    FROM public.haztartas h
    JOIN public.csalad c ON c.id = h.legacy_csalad_id
    WHERE h.congregation_id = p_congregation_id AND h.ervenyes_ig IS NULL
      AND c.isaktiv = true AND c.id_ferfi IS NOT NULL
    ON CONFLICT (id_haztartas, id_szemely) WHERE ervenyes_ig IS NULL DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_cnt FROM ins;
  v_created_tag := v_created_tag + v_cnt;

  -- 2/c) haztartas_tag — feleség
  WITH ins AS (
    INSERT INTO public.haztartas_tag (id_haztartas, id_szemely, szerep, is_primary, ervenyes_tol, congregation_id)
    SELECT h.id, c.id_no, 'hazastars',
           CASE WHEN c.id_ferfi IS NULL THEN true ELSE false END,
           CURRENT_DATE, h.congregation_id
    FROM public.haztartas h
    JOIN public.csalad c ON c.id = h.legacy_csalad_id
    WHERE h.congregation_id = p_congregation_id AND h.ervenyes_ig IS NULL
      AND c.isaktiv = true AND c.id_no IS NOT NULL
    ON CONFLICT (id_haztartas, id_szemely) WHERE ervenyes_ig IS NULL DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_cnt FROM ins;
  v_created_tag := v_created_tag + v_cnt;

  -- 2/d) haztartas_tag — gyerekek
  WITH ins AS (
    INSERT INTO public.haztartas_tag (id_haztartas, id_szemely, szerep, is_primary, ervenyes_tol, congregation_id)
    SELECT h.id, g.id_szemely, 'gyermek', false, CURRENT_DATE, h.congregation_id
    FROM public.gyerek g
    JOIN public.csalad c ON c.id = g.id_csalad AND c.isaktiv = true
    JOIN public.haztartas h ON h.legacy_csalad_id = c.id
    WHERE h.congregation_id = p_congregation_id AND h.ervenyes_ig IS NULL
    ON CONFLICT (id_haztartas, id_szemely) WHERE ervenyes_ig IS NULL DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_cnt FROM ins;
  v_created_tag := v_created_tag + v_cnt;

  -- 2/e) szemely_kapcsolat — házastársi él (v3: csak aktív csalad; SEMMILYEN
  --      meglévő él — aktív VAGY lezárt, bármely irányban — mellé nem szúrunk
  --      újat: a lezárás tudatos döntés, nem támasztjuk fel)
  WITH ins AS (
    INSERT INTO public.szemely_kapcsolat (id_szemely_1, id_szemely_2, tipus, ver_szerinti, ervenyes_tol, congregation_id, megjegyzes)
    SELECT c.id_ferfi, c.id_no, 'hazastars', false, NULL::date, h.congregation_id, 'sync_households_from_csalad'
    FROM public.haztartas h
    JOIN public.csalad c ON c.id = h.legacy_csalad_id
    WHERE h.congregation_id = p_congregation_id
      AND c.isaktiv = true
      AND c.id_ferfi IS NOT NULL AND c.id_no IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.szemely_kapcsolat k
        WHERE k.tipus = 'hazastars'
          AND ((k.id_szemely_1 = c.id_ferfi AND k.id_szemely_2 = c.id_no)
            OR (k.id_szemely_1 = c.id_no AND k.id_szemely_2 = c.id_ferfi))
      )
    RETURNING 1
  ) SELECT count(*) INTO v_cnt FROM ins;
  v_created_kapcsolat := v_created_kapcsolat + v_cnt;

  -- 2/f) szemely_kapcsolat — apa → gyerek
  WITH ins AS (
    INSERT INTO public.szemely_kapcsolat (id_szemely_1, id_szemely_2, tipus, ver_szerinti, ervenyes_tol, congregation_id, megjegyzes)
    SELECT DISTINCT c.id_ferfi, g.id_szemely, 'szulo_gyermek', true, NULL::date, h.congregation_id, 'sync_households_from_csalad'
    FROM public.gyerek g
    JOIN public.csalad c ON c.id = g.id_csalad AND c.isaktiv = true
    JOIN public.haztartas h ON h.legacy_csalad_id = c.id
    WHERE h.congregation_id = p_congregation_id AND c.id_ferfi IS NOT NULL
      AND c.id_ferfi <> g.id_szemely
      AND NOT EXISTS (
        SELECT 1 FROM public.szemely_kapcsolat k
        WHERE k.tipus = 'szulo_gyermek'
          AND k.id_szemely_1 = c.id_ferfi AND k.id_szemely_2 = g.id_szemely
      )
    RETURNING 1
  ) SELECT count(*) INTO v_cnt FROM ins;
  v_created_kapcsolat := v_created_kapcsolat + v_cnt;

  -- 2/g) szemely_kapcsolat — anya → gyerek
  WITH ins AS (
    INSERT INTO public.szemely_kapcsolat (id_szemely_1, id_szemely_2, tipus, ver_szerinti, ervenyes_tol, congregation_id, megjegyzes)
    SELECT DISTINCT c.id_no, g.id_szemely, 'szulo_gyermek', true, NULL::date, h.congregation_id, 'sync_households_from_csalad'
    FROM public.gyerek g
    JOIN public.csalad c ON c.id = g.id_csalad AND c.isaktiv = true
    JOIN public.haztartas h ON h.legacy_csalad_id = c.id
    WHERE h.congregation_id = p_congregation_id AND c.id_no IS NOT NULL
      AND c.id_no <> g.id_szemely
      AND NOT EXISTS (
        SELECT 1 FROM public.szemely_kapcsolat k
        WHERE k.tipus = 'szulo_gyermek'
          AND k.id_szemely_1 = c.id_no AND k.id_szemely_2 = g.id_szemely
      )
    RETURNING 1
  ) SELECT count(*) INTO v_cnt FROM ins;
  v_created_kapcsolat := v_created_kapcsolat + v_cnt;

  RETURN jsonb_build_object(
    'status', 'ok',
    'haztartas_created', v_created_haztartas,
    'tag_created', v_created_tag,
    'kapcsolat_created', v_created_kapcsolat
  );
END;
$$;

COMMENT ON FUNCTION public.sync_households_from_csalad(uuid) IS
  'Idempotens csalad→haztartas szinkron v3 (2026-08-02, PR-21): csak AKTÍV családból dolgozik, lezárt rokonsági élt nem szúr be újra (a lezárás tudatos döntés). v1-v2: 2026-07-18 (PR-3).';

-- Telepítés-ellenőrző: várt v3_telepitve = true
SELECT position('c.isaktiv = true' IN pg_get_functiondef('public.sync_households_from_csalad(uuid)'::regprocedure)) > 0
  AS v3_telepitve;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. VERIFIKÁCIÓ
-- ────────────────────────────────────────────────────────────────────────────

-- 3/a: MEGMARADT több-házastársas személyek (ezek NEM tagság-eredetűek —
--      anyakönyvi/kézi élek; a családfa figyelmeztető sávja is mutatja őket,
--      javításuk a házassági anyakönyvben / kézzel történik). Várt: 0 vagy
--      csak valós, tudatos esetek.
WITH parok AS (
  SELECT k.id, k.id_szemely_1, k.id_szemely_2, k.megjegyzes
  FROM public.szemely_kapcsolat k
  WHERE k.tipus = 'hazastars' AND k.ervenyes_ig IS NULL
),
szemelyenkent AS (
  SELECT p.id_szemely_1 AS szemely_id, p.id AS el_id, p.id_szemely_2 AS partner_id, p.megjegyzes FROM parok p
  UNION ALL
  SELECT p.id_szemely_2, p.id, p.id_szemely_1, p.megjegyzes FROM parok p
)
SELECT sz.csaladnev || ' ' || sz.k_nev || ' (' || COALESCE(LEFT(sz.sz_datum::text,4),'?') || ')' AS szemely,
       COUNT(*) AS aktiv_hazastars_elek,
       string_agg(p2.csaladnev || ' ' || p2.k_nev || ' [' || COALESCE(s.megjegyzes,'anyakönyv/CNP') || ']', ' ÉS ')
FROM szemelyenkent s
JOIN public.szemely sz ON sz.id = s.szemely_id
JOIN public.szemely p2 ON p2.id = s.partner_id
GROUP BY s.szemely_id, sz.csaladnev, sz.k_nev, sz.sz_datum
HAVING COUNT(*) > 1
ORDER BY aktiv_hazastars_elek DESC;

-- 3/b: DUPLIKÁLT SZEMÉLYEK (azonos név + születési dátum, mindkettő él) —
--      a diagnosztikában talált #1304/#1680/#1717-féle esetek. Ezek
--      összevonása külön (jövőbeli person_identity) funkció — addig kézzel
--      döntendő, melyik marad.
SELECT s1.id AS szemely_a, s2.id AS szemely_b,
       s1.csaladnev || ' ' || s1.k_nev AS nev,
       s1.sz_datum,
       c1.name AS gyulekezet_a, c2.name AS gyulekezet_b
FROM public.szemely s1
JOIN public.szemely s2
  ON s2.id > s1.id
 AND LOWER(COALESCE(s2.csaladnev,'')) = LOWER(COALESCE(s1.csaladnev,''))
 AND LOWER(COALESCE(s2.k_nev,'')) = LOWER(COALESCE(s1.k_nev,''))
 AND s2.sz_datum = s1.sz_datum
 AND s1.sz_datum IS NOT NULL
LEFT JOIN public.congregations c1 ON c1.id = s1.congregation_id
LEFT JOIN public.congregations c2 ON c2.id = s2.congregation_id
WHERE COALESCE(s1.meghalt,false) = false AND COALESCE(s2.meghalt,false) = false
ORDER BY nev;
