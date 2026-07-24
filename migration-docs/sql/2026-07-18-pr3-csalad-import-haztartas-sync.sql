-- ============================================================================
-- PR-3 (tagnyilvántartás, család-import) — HAZTARTAS-SZINKRON + TIMEOUT-FIX
-- Dátum: 2026-07-18
-- Terv: docs/project-tracking/KARTOTEKA-tagnyilvantartas-finomhangolas-terv-2026-07-17.md (F6.1, F6.2)
--
-- MIT JAVÍT (2 db P0):
--   1. LÁTHATATLAN CSALÁDOK: mind a 3 család-import út (import_family_head_batch,
--      import_families_from_existing_persons_batch, infer_family_links_for_congregation)
--      csak a legacy `csalad`+`gyerek` táblákba ír, a Családok fül viszont az ÚJ
--      `haztartas`-modellből olvas → az importált családok nem jelennek meg.
--      Megoldás: sync_households_from_csalad(uuid) — a 2026-06-01-es fazis1-backfill
--      logikájának idempotens, gyülekezet-szűkített RPC-változata; az app minden
--      import-út végén meghívja, és itt egy egyszeri catch-up is lefut.
--   2. TIMEOUT: a 120s statement_timeout eddig CSAK az infer-RPC-n volt (2026-07-15);
--      a két batch-RPC a 8s-os authenticated-limiten maradt → nagy fájlnál az
--      EGÉSZ import visszagörgetődött. Itt mindkettő 120s-ot kap.
--
-- FUTTATÁSI SORREND: 1. ELŐ-ELLENŐRZÉS → 2. RPC → 3. ALTER-ek → 4. CATCH-UP → 5. VERIFIKÁCIÓ
--
-- v2 (2026-07-18): az első futás "invalid input syntax for type integer: <uuid>"
--   hibával elhalt — a cim.id UUID, nem integer; a v_cim_id deklaráció
--   %TYPE-ra váltva, így a tábla tényleges oszloptípusát veszi fel.
--   (A hibás futás mindent visszagörgetett — ezt a fájlt az ELEJÉTŐL kell futtatni.)
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. ELŐ-ELLENŐRZÉS — a két batch-RPC szignatúrája (várt: mindkettő
--    (uuid, jsonb, jsonb, jsonb) EGYETLEN sorral; ha más, ÁLLJ MEG és jelezd!)
-- ────────────────────────────────────────────────────────────────────────────
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('import_family_head_batch', 'import_families_from_existing_persons_batch')
ORDER BY p.proname;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. sync_households_from_csalad — idempotens csalad→haztartas szinkron
--    (a fazis1-backfill kanonikus logikája, gyülekezet-szűkítve; a meglévő
--    háztartások HIÁNYZÓ tagjait is pótolja — így az auto-link utólagos
--    házastárs/gyerek-kötései is átvezetődnek)
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
  -- v2: %TYPE — a cim.id UUID az élesben (nem integer); így mindig a tábla
  -- tényleges kulcstípusát veszi fel.
  v_cim_id public.cim.id%TYPE;
  v_created_haztartas int := 0;
  v_created_tag int := 0;
  v_created_kapcsolat int := 0;
  v_cnt int;
BEGIN
  IF NOT public.current_user_can_access_congregation(p_congregation_id) THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  -- 2/a) Hiányzó cim + haztartas létrehozása minden olyan csalad-hoz, amelynek
  --      feje/házastársa ehhez a gyülekezethez tartozik (soronként, hogy a
  --      cim→haztartas kötés determinisztikus legyen — a backfill törékeny
  --      vissza-keresése helyett).
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

  -- 2/b) haztartas_tag — férj (családfő) — MINDEN (új ÉS meglévő) háztartásra,
  --      hogy az auto-link utólagos kötései is bepótlódjanak.
  WITH ins AS (
    INSERT INTO public.haztartas_tag (id_haztartas, id_szemely, szerep, is_primary, ervenyes_tol, congregation_id)
    SELECT h.id, c.id_ferfi, 'csaladfo', true, CURRENT_DATE, h.congregation_id
    FROM public.haztartas h
    JOIN public.csalad c ON c.id = h.legacy_csalad_id
    WHERE h.congregation_id = p_congregation_id AND c.id_ferfi IS NOT NULL
    ON CONFLICT (id_haztartas, id_szemely) WHERE ervenyes_ig IS NULL DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_cnt FROM ins;
  v_created_tag := v_created_tag + v_cnt;

  -- 2/c) haztartas_tag — feleség (házastárs)
  WITH ins AS (
    INSERT INTO public.haztartas_tag (id_haztartas, id_szemely, szerep, is_primary, ervenyes_tol, congregation_id)
    SELECT h.id, c.id_no, 'hazastars',
           CASE WHEN c.id_ferfi IS NULL THEN true ELSE false END,
           CURRENT_DATE, h.congregation_id
    FROM public.haztartas h
    JOIN public.csalad c ON c.id = h.legacy_csalad_id
    WHERE h.congregation_id = p_congregation_id AND c.id_no IS NOT NULL
    ON CONFLICT (id_haztartas, id_szemely) WHERE ervenyes_ig IS NULL DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_cnt FROM ins;
  v_created_tag := v_created_tag + v_cnt;

  -- 2/d) haztartas_tag — gyerekek
  WITH ins AS (
    INSERT INTO public.haztartas_tag (id_haztartas, id_szemely, szerep, is_primary, ervenyes_tol, congregation_id)
    SELECT h.id, g.id_szemely, 'gyermek', false, CURRENT_DATE, h.congregation_id
    FROM public.gyerek g
    JOIN public.csalad c ON c.id = g.id_csalad
    JOIN public.haztartas h ON h.legacy_csalad_id = c.id
    WHERE h.congregation_id = p_congregation_id
    ON CONFLICT (id_haztartas, id_szemely) WHERE ervenyes_ig IS NULL DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_cnt FROM ins;
  v_created_tag := v_created_tag + v_cnt;

  -- 2/e) szemely_kapcsolat — házastársi él (ha mindkét fél megvan)
  WITH ins AS (
    INSERT INTO public.szemely_kapcsolat (id_szemely_1, id_szemely_2, tipus, ver_szerinti, ervenyes_tol, congregation_id, megjegyzes)
    SELECT c.id_ferfi, c.id_no, 'hazastars', false, NULL::date, h.congregation_id, 'sync_households_from_csalad'
    FROM public.haztartas h
    JOIN public.csalad c ON c.id = h.legacy_csalad_id
    WHERE h.congregation_id = p_congregation_id
      AND c.id_ferfi IS NOT NULL AND c.id_no IS NOT NULL
    ON CONFLICT (id_szemely_1, id_szemely_2, tipus) WHERE ervenyes_ig IS NULL DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_cnt FROM ins;
  v_created_kapcsolat := v_created_kapcsolat + v_cnt;

  -- 2/f) szemely_kapcsolat — apa → gyerek
  WITH ins AS (
    INSERT INTO public.szemely_kapcsolat (id_szemely_1, id_szemely_2, tipus, ver_szerinti, ervenyes_tol, congregation_id, megjegyzes)
    SELECT DISTINCT c.id_ferfi, g.id_szemely, 'szulo_gyermek', true, NULL::date, h.congregation_id, 'sync_households_from_csalad'
    FROM public.gyerek g
    JOIN public.csalad c ON c.id = g.id_csalad
    JOIN public.haztartas h ON h.legacy_csalad_id = c.id
    WHERE h.congregation_id = p_congregation_id AND c.id_ferfi IS NOT NULL
    ON CONFLICT (id_szemely_1, id_szemely_2, tipus) WHERE ervenyes_ig IS NULL DO NOTHING
    RETURNING 1
  ) SELECT count(*) INTO v_cnt FROM ins;
  v_created_kapcsolat := v_created_kapcsolat + v_cnt;

  -- 2/g) szemely_kapcsolat — anya → gyerek
  WITH ins AS (
    INSERT INTO public.szemely_kapcsolat (id_szemely_1, id_szemely_2, tipus, ver_szerinti, ervenyes_tol, congregation_id, megjegyzes)
    SELECT DISTINCT c.id_no, g.id_szemely, 'szulo_gyermek', true, NULL::date, h.congregation_id, 'sync_households_from_csalad'
    FROM public.gyerek g
    JOIN public.csalad c ON c.id = g.id_csalad
    JOIN public.haztartas h ON h.legacy_csalad_id = c.id
    WHERE h.congregation_id = p_congregation_id AND c.id_no IS NOT NULL
    ON CONFLICT (id_szemely_1, id_szemely_2, tipus) WHERE ervenyes_ig IS NULL DO NOTHING
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
  'Idempotens csalad→haztartas szinkron (2026-07-18, PR-3): a legacy csalad/gyerek rekordokat átvezeti az új cim+haztartas+haztartas_tag+szemely_kapcsolat modellbe egy gyülekezetre szűkítve. Az import-utak minden futás után meghívják — enélkül az importált családok láthatatlanok a Családok fülön.';

REVOKE ALL ON FUNCTION public.sync_households_from_csalad(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_households_from_csalad(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_households_from_csalad(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. statement_timeout = 120s a két batch-RPC-re (a 2026-07-15-ös infer-fix
--    pontos analógja — az authenticated szerep 8s-os limitje ellen)
-- ────────────────────────────────────────────────────────────────────────────

ALTER FUNCTION public.import_family_head_batch(uuid, jsonb, jsonb, jsonb)
  SET statement_timeout = '120s';

ALTER FUNCTION public.import_families_from_existing_persons_batch(uuid, jsonb, jsonb, jsonb)
  SET statement_timeout = '120s';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. EGYSZERI CATCH-UP — a MÁR beimportált, haztartas nélküli családok
--    átvezetése minden gyülekezetre (idempotens, biztonságos)
-- ────────────────────────────────────────────────────────────────────────────

SELECT c.name, public.sync_households_from_csalad(c.id) AS eredmeny
FROM public.congregations c
ORDER BY c.name;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. VERIFIKÁCIÓ
-- ────────────────────────────────────────────────────────────────────────────

-- 5/a: maradt-e haztartas nélküli csalad (várt: csak olyan, ahol sem férj, sem
--      feleség nincs megadva — ezekhez nem fejthető vissza a gyülekezet)
SELECT COALESCE(sf.congregation_id, sn.congregation_id) AS congregation_id,
       COUNT(*) AS csalad_osszes,
       COUNT(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM public.haztartas h WHERE h.legacy_csalad_id = c.id
       )) AS haztartas_nelkul
FROM public.csalad c
LEFT JOIN public.szemely sf ON sf.id = c.id_ferfi
LEFT JOIN public.szemely sn ON sn.id = c.id_no
GROUP BY 1 ORDER BY haztartas_nelkul DESC;

-- 5/b: a timeout-beállítások élnek-e (várt: mindhárom függvénynél statement_timeout=120s)
SELECT p.proname, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('import_family_head_batch', 'import_families_from_existing_persons_batch',
                    'infer_family_links_for_congregation', 'sync_households_from_csalad')
ORDER BY p.proname;
