-- =============================================================================
-- KARTOTÉKA — A FANTOM BARÁTOSI TAKARÍTÁSA
-- 2026-07-16
--
-- HELYZET (a 2026-07-16-penzugy-gyokerok-fokuszalt.sql 3. blokkja igazolta):
--   c0e00c4a-08bd-4454-86eb-c6f00e5ecf73  = FANTOM  (0 személy, 0 befizetés,
--        0 kiadás, 0 profil, DE 1 profile_roles sor mutat rá + 2 bealitas sor)
--   43cff37f-1131-4c79-8082-0e8af61cf40a  = VALÓDI  (614 személy, 503 befizetés,
--        273 kiadás, 2 profil, 2 szerepkör)
--
-- A HIBA MECHANIZMUSA: az app a profile_roles.scope_id-ból veszi, melyik
--   gyülekezetet nézi (= a FANTOM), az RLS viszont csak a profiles.congregation_id-t
--   engedi (= a VALÓDI). A kettő széthúz → a DB némán 0 sort ad → zsákutca.
--
-- ⚠️⚠️ EZ A FÁJL MÓDOSÍT! Olvassa el végig, mielőtt futtatja.
--   - Az 1. LÉPÉS csak ELLENŐRIZ (futtassa le előbb ezt önmagában!).
--   - A 2. LÉPÉS tranzakcióban töröl, beépített biztonsági fékkel: ha a fantomon
--     BÁRMILYEN adat van, a szkript SZÁNDÉKOSAN HIBÁRA FUT és nem töröl semmit.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LÉPÉS — ELLENŐRZÉS (csak olvas). Futtassa le ELŐSZÖR, önmagában!
--    Nézze meg: tényleg üres-e a fantom, és KI-nek a szerepköre mutat rá.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  'FANTOM tartalma'                                            AS mit_nezunk,
  (SELECT count(*) FROM public.szemely   WHERE congregation_id = 'c0e00c4a-08bd-4454-86eb-c6f00e5ecf73') AS szemelyek,
  (SELECT count(*) FROM public.befizetes WHERE congregation_id = 'c0e00c4a-08bd-4454-86eb-c6f00e5ecf73') AS befizetesek,
  (SELECT count(*) FROM public.kiadas    WHERE congregation_id = 'c0e00c4a-08bd-4454-86eb-c6f00e5ecf73') AS kiadasok,
  (SELECT count(*) FROM public.profiles  WHERE congregation_id = 'c0e00c4a-08bd-4454-86eb-c6f00e5ecf73') AS profilok;

-- KI-nek a szerepköre mutat a fantomra? (ez okozza a profilválasztó dupla kártyáját)
SELECT
  pr.id            AS profile_roles_id,
  p.email,
  p.full_name,
  p.role           AS profiles_role,
  p.congregation_id AS profil_skalar_valodi_gyulekezet,
  pr.scope,
  pr.scope_id      AS szerepkor_a_fantomra_mutat,
  pr.role          AS szerepkor_role,
  pr.approval_status,
  pr.granted_at
FROM public.profile_roles pr
JOIN public.profiles p ON p.id = pr.profile_id
WHERE pr.scope_id = 'c0e00c4a-08bd-4454-86eb-c6f00e5ecf73';

-- Van-e BÁRMELY másik tábla, ami a fantomra hivatkozik? (FK-k végigpásztázása)
SELECT
  c.conrelid::regclass::text AS hivatkozo_tabla,
  a.attname                  AS oszlop,
  c.confdeltype              AS on_delete_szabaly  -- a=NO ACTION, r=RESTRICT, c=CASCADE, n=SET NULL
FROM pg_constraint c
JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
WHERE c.contype = 'f'
  AND c.confrelid = 'public.congregations'::regclass
ORDER BY 1, 2;


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. LÉPÉS — TAKARÍTÁS.
--    CSAK AKKOR futtassa, ha az 1. lépés megerősítette: a fantomon 0/0/0/0.
--    A szkript maga is ellenőrzi — ha adatot talál, HIBÁRA FUT és nem töröl.
-- ═════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
DECLARE
  v_fantom  uuid := 'c0e00c4a-08bd-4454-86eb-c6f00e5ecf73';
  v_valodi  uuid := '43cff37f-1131-4c79-8082-0e8af61cf40a';
  v_db      int;
BEGIN
  -- ── BIZTONSÁGI FÉK 1: a fantomon nem lehet SEMMILYEN érdemi adat ──
  SELECT
      (SELECT count(*) FROM public.szemely   WHERE congregation_id = v_fantom)
    + (SELECT count(*) FROM public.befizetes WHERE congregation_id = v_fantom)
    + (SELECT count(*) FROM public.kiadas    WHERE congregation_id = v_fantom)
    + (SELECT count(*) FROM public.profiles  WHERE congregation_id = v_fantom)
  INTO v_db;

  IF v_db > 0 THEN
    RAISE EXCEPTION
      'MEGSZAKÍTVA: a fantom gyülekezeten % darab élő rekord van. NEM törlök semmit. Előbb vizsgálja meg kézzel!', v_db;
  END IF;

  -- ── BIZTONSÁGI FÉK 2: a valódi gyülekezetnek léteznie kell és tartalmasnak kell lennie ──
  IF NOT EXISTS (SELECT 1 FROM public.congregations WHERE id = v_valodi) THEN
    RAISE EXCEPTION 'MEGSZAKÍTVA: a valódi gyülekezet (%) nem található!', v_valodi;
  END IF;
  IF (SELECT count(*) FROM public.szemely WHERE congregation_id = v_valodi) = 0 THEN
    RAISE EXCEPTION 'MEGSZAKÍTVA: a valódi gyülekezeten 0 személy van — valami nem stimmel, nem törlök!';
  END IF;

  -- ── 1) A fantomra mutató szerepkör(ök) ÁTIRÁNYÍTÁSA a valódira ─────────────
  --    (Nem törlünk szerepkört: ha valakinek ez volt az egyetlen belépője,
  --     a törlés kizárná a rendszerből. Átirányítás a biztonságos lépés.)
  --    Ha a felhasználónak MÁR van szerepköre a valódira, az átirányítás
  --    duplikátumot csinálna — ilyenkor inkább töröljük a fölöslegeset.
  DELETE FROM public.profile_roles pr
  WHERE pr.scope = 'congregation'
    AND pr.scope_id = v_fantom
    AND EXISTS (
      SELECT 1 FROM public.profile_roles pr2
      WHERE pr2.profile_id = pr.profile_id
        AND pr2.scope = 'congregation'
        AND pr2.scope_id = v_valodi
    );
  GET DIAGNOSTICS v_db = ROW_COUNT;
  RAISE NOTICE 'Fölösleges (már meglévő párú) szerepkör törölve: %', v_db;

  UPDATE public.profile_roles
  SET scope_id = v_valodi
  WHERE scope = 'congregation'
    AND scope_id = v_fantom;
  GET DIAGNOSTICS v_db = ROW_COUNT;
  RAISE NOTICE 'Szerepkör átirányítva a valódi gyülekezetre: %', v_db;

  -- ── 2) A fantom bealitas sorai (2025=130, 2026=220) ────────────────────────
  --    FIGYELEM: a 2025=130 érték ITT él. Ha 2025-re valóban 130 a helyes,
  --    azt a VALÓDI gyülekezeten kell beállítani — lásd a fájl végén.
  DELETE FROM public.bealitas WHERE congregation_id = v_fantom;
  GET DIAGNOSTICS v_db = ROW_COUNT;
  RAISE NOTICE 'Fantom bealitas sorok törölve: %', v_db;

  -- ── 3) Maga a fantom gyülekezet ────────────────────────────────────────────
  DELETE FROM public.congregations WHERE id = v_fantom;
  GET DIAGNOSTICS v_db = ROW_COUNT;
  RAISE NOTICE 'Fantom gyülekezet törölve: %', v_db;
END $$;

-- ── ELLENŐRZÉS a commit ELŐTT — nézze meg az eredményt! ──────────────────────
SELECT id, name, nev_hu,
       (SELECT count(*) FROM public.szemely s WHERE s.congregation_id = c.id) AS szemelyek
FROM public.congregations c
WHERE c.name ILIKE '%arátos%' OR c.nev_hu ILIKE '%arátos%';

-- Ha a fenti EGYETLEN sort ad vissza (a valódi, 614 személlyel), akkor:
COMMIT;
-- Ha bármi gyanús, e helyett:  ROLLBACK;


-- =============================================================================
-- 3. LÉPÉS (OPCIONÁLIS, KÖNYVELŐI DÖNTÉS — NEM futtatom Ön helyett!)
--
-- Ha 2025-re valóban 130 lej az egyházfenntartói járulék a VALÓDI Barátosin
-- (jelenleg 220 van beállítva), akkor ezzel állítható át:
--
--   UPDATE public.bealitas
--   SET eves_jarulek = 130
--   WHERE congregation_id = '43cff37f-1131-4c79-8082-0e8af61cf40a'
--     AND id = '2025';
--
-- ⚠️ EZ VISSZAMENŐLEG ÁTSZÁMÍTJA 614 TAG 2025-ÖS TARTOZÁSÁT. Csak akkor futtassa,
--    ha a gyülekezet vezetősége így döntött. Előtte érdemes megnézni, mennyi
--    befizetés érkezett már 220-as elvárással:
--
--   SELECT count(*), sum(osszeg) FROM public.befizetes
--   WHERE congregation_id = '43cff37f-1131-4c79-8082-0e8af61cf40a'
--     AND fizetettev = 2025;
-- =============================================================================
