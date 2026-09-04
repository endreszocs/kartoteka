-- ═══════════════════════════════════════════════════════════════════════════
--  ANYAKÖNYV — AUDIT-NYOMVONAL + SORSZÁM-VÉDELEM + ELHUNYT-ÁTVEZETÉS
--  2026-09-04 — Futtatja: Endre (Supabase SQL editor), EGYBEN
--
--  A 2026-09-04-i ÉLŐ állapotfelmérés három megállapítására válaszol. Mindhárom
--  szakasz KÜLÖN áll és külön őrzött: ha az egyik nem alkalmazható, a többi
--  akkor is lefut, és a záró rács megmondja, mi történt.
--
--  „A" — AUDIT-NYOMVONAL AZ ANYAKÖNYVRE
--      A `szemely`, a `befizetes` és a `kiadas` naplózva van (a `szemely`-en
--      4965 audit-sor), az anyakönyvi 8 táblán viszont NINCS `audit_trg`.
--      Vagyis egy keresztelési, házassági vagy temetési bejegyzés átírható és
--      törölhető NYOM NÉLKÜL — épp a hivatalos egyházi anyakönyvön.
--      Ugyanazt a bevált telepítőt futtatjuk, mint a 2026-06-05-i körben.
--
--  „B" — SORSZÁM-ÜTKÖZÉS ELLENI VÉDELEM
--      Az `egyhazi_szam`-on EGYETLEN táblán sincs egyediségi index, a
--      `generate_egyhazi_anyakonyvi_szam` pedig `lock=false` (se advisory lock,
--      se FOR UPDATE). Két egyidejű rögzítés AZONOS sorszámot kaphat. Ma nincs
--      duplikátum — a részleges egyedi index ezt tartósítja is.
--      ⚠️ A ZÁR (advisory lock) NEM ebben a körben megy: ahhoz a generátor
--         törzsét kell átírni, azt előbb LÁTNI akarom (lásd a záró rácsot).
--
--  „C" — AZ ELTEMETETTEK ÁTVEZETÉSE
--      55 temetési sor van, de `member_status` szerint EGYETLEN ember 'elhunyt'
--      és 646 'aktív'. A `trg_temetes_set_meghalt` a RÉGI `meghalt` mezőt
--      állítja, a később bevezetett `member_status`-t nem. Ez torzítja a
--      létszám-statisztikát, a VÁLASZTÓI NÉVJEGYZÉKET és a JÁRULÉK-ELVÁRÁST
--      (halott tagtól is várna befizetést).
--      ⚠️ Itt CSAK a meglévő adatot vezetjük át. A TRIGGER javítása a következő
--         kör — a záró rács kiírja a mostani törzsét, hogy ne vaktában írjam át.
--
--  ⚠️ 503-ABLAK: a trigger-DDL után a PostgREST újratölti a séma-gyorsítótárat,
--     és percekig 503-at adhat („schema cache… Retrying"). MAGÁTÓL GYÓGYUL.
--     NE rollbackelj reflexből — előbb frissíts, és nézd meg újra.
--     Ezek a táblák kicsik (83/45/21/55/11/14/0/0 sor), tehát az ablak rövid.
--
--  FUTTATÁS: egyben, jelölés nélkül. Újrafuttatható (idempotens).
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
--  „A" — AUDIT-TRIGGER AZ ANYAKÖNYVI TÁBLÁKRA
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  t text;
  v_fn int;
BEGIN
  -- ELŐFELTÉTEL: a napló-függvénynek léteznie kell. E nélkül a CREATE TRIGGER
  -- hibára futna, és a fájl többi szakasza sem futna le.
  SELECT count(*) INTO v_fn
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'audit' AND p.proname = 'log_change';
  IF v_fn = 0 THEN
    RAISE EXCEPTION 'MEGÁLLÍTVA: nincs audit.log_change() — előbb a 2026-06-05n-row-audit.sql-t kell lefuttatni.';
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'keresztseg', 'konfirmalas', 'hazassag', 'temetes',
    'bekoltozott', 'elkoltozott', 'attert', 'kitert'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_trg ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION audit.log_change()', t);
      RAISE NOTICE 'audit_trg felrakva: %', t;
    ELSE
      RAISE NOTICE 'kihagyva (nincs ilyen tábla): %', t;
    END IF;
  END LOOP;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
--  „B" — RÉSZLEGES EGYEDI INDEX AZ egyhazi_szam-ON (gyülekezetenként)
--
--  Részleges (WHERE egyhazi_szam IS NOT NULL), mert a szám nélküli sorok
--  LEGÁLISAK: az élő adatban 6 ilyen van (2 keresztelés, 1-1 konfirmálás,
--  házasság, temetés, elköltözés). Azokat nem szabad kizárni.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  t text;
  v_dup int;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'keresztseg', 'konfirmalas', 'hazassag', 'temetes',
    'bekoltozott', 'elkoltozott', 'attert', 'kitert'
  ]
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = t) THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = t
                     AND column_name = 'egyhazi_szam') THEN
      RAISE NOTICE 'kihagyva (nincs egyhazi_szam oszlop): %', t;
      CONTINUE;
    END IF;

    -- FAIL-SAFE: ha MÉGIS van duplikátum, az index létrehozása hibára futna és
    -- elvinné az egész szakaszt. Inkább KIHAGYJUK és HANGOSAN jelezzük.
    EXECUTE format(
      'SELECT count(*) FROM (SELECT congregation_id, egyhazi_szam FROM public.%I '
      'WHERE egyhazi_szam IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1) d', t)
    INTO v_dup;

    IF v_dup > 0 THEN
      RAISE WARNING '⛔ %: % duplikált sorszám van — az egyedi index NEM jött létre. Előbb tisztítsd.', t, v_dup;
      CONTINUE;
    END IF;

    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS uniq_%s_egyhazi_szam '
      'ON public.%I (congregation_id, egyhazi_szam) WHERE egyhazi_szam IS NOT NULL', t, t);
    RAISE NOTICE 'egyedi index rendben: %', t;
  END LOOP;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
--  „C" — AZ ELTEMETETTEK ÁTVEZETÉSE (member_status + meghalt)
--
--  Akinek ÉLŐ temetési sora van, az elhunyt. A `deleted` szűrőt csak akkor
--  tesszük be, ha a `temetes` táblának VAN ilyen oszlopa — egy törölt temetési
--  bejegyzés nem nyilváníthat halottá senkit.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_szuro text := '';
  v_db int;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'temetes'
               AND column_name = 'deleted') THEN
    v_szuro := ' AND NOT COALESCE(t.deleted, false)';
  END IF;

  EXECUTE format($sql$
    UPDATE public.szemely s
    SET member_status = 'elhunyt',
        meghalt = true
    WHERE EXISTS (SELECT 1 FROM public.temetes t WHERE t.id_szemely = s.id%s)
      AND (COALESCE(s.member_status, '') <> 'elhunyt' OR COALESCE(s.meghalt, false) = false)
  $sql$, v_szuro);

  GET DIAGNOSTICS v_db = ROW_COUNT;
  RAISE NOTICE 'elhunytra átvezetve: % személy', v_db;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
--  ELLENŐRZÉS — EGY RÁCS
--  (A szerkesztő csak az UTOLSÓ rácsot mutatja; ezért egyetlen lekérdezés.)
-- ═══════════════════════════════════════════════════════════════════════════
WITH tablak(t) AS (
  VALUES ('keresztseg'),('konfirmalas'),('hazassag'),('temetes'),
         ('bekoltozott'),('elkoltozott'),('attert'),('kitert')
),
a_audit AS (
  SELECT 'A · audit-trigger' AS szakasz, t AS kulcs,
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = t
             AND NOT tg.tgisinternal AND tg.tgname = 'audit_trg'
         ) THEN '✅ van' ELSE '⛔ NINCS' END AS ertek
  FROM tablak
),
b_index AS (
  SELECT 'B · egyedi sorszám-index' AS szakasz, t AS kulcs,
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public' AND tablename = t
             AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%egyhazi_szam%'
         ) THEN '✅ van' ELSE '⚠️ nincs (lásd a NOTICE/WARNING sorokat)' END AS ertek
  FROM tablak
),
c_allapot AS (
  SELECT 'C · elhunyt-átvezetés' AS szakasz,
         '1) member_status értékkészlet' AS kulcs,
         COALESCE((SELECT string_agg(COALESCE(member_status,'NULL') || ': ' || n, ' | ' ORDER BY n DESC)
                   FROM (SELECT member_status, count(*) n FROM public.szemely GROUP BY 1) s), '—') AS ertek
  UNION ALL
  SELECT 'C · elhunyt-átvezetés', '2) VAN temetési sor, de nem elhunyt (0 a cél)',
         (SELECT count(*) FROM public.szemely s
          WHERE EXISTS (SELECT 1 FROM public.temetes t WHERE t.id_szemely = s.id)
            AND (COALESCE(s.member_status,'') <> 'elhunyt' OR COALESCE(s.meghalt,false) = false))::text
  UNION ALL
  SELECT 'C · elhunyt-átvezetés', '3) elhunyt, de NINCS temetési sor (ellenőrzés)',
         (SELECT count(*) FROM public.szemely s
          WHERE COALESCE(s.member_status,'') = 'elhunyt'
            AND NOT EXISTS (SELECT 1 FROM public.temetes t WHERE t.id_szemely = s.id))::text
),
-- A KÖVETKEZŐ KÖRHÖZ: a két érintett függvény törzse, hogy ne vaktában írjam át.
-- A hosszabb függvény (3248 karakter) egy cellában csonkulna, ezért 1200-as
-- darabokban jön — a rács `kulcs` oszlopa mutatja a darab sorszámát.
d_fuggvenyek AS (
  SELECT 'D · a következő kör bemenete' AS szakasz,
         p.proname || ' — ' || d.i || '. rész' AS kulcs,
         replace(substr(p.prosrc, (d.i - 1) * 1200 + 1, 1200), E'\n', ' ⏎ ') AS ertek
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN generate_series(1, 4) AS d(i)
  WHERE n.nspname = 'public'
    AND p.proname IN ('set_szemely_meghalt_on_temetes', 'generate_egyhazi_anyakonyvi_szam')
    AND length(p.prosrc) > (d.i - 1) * 1200
)
SELECT * FROM a_audit
UNION ALL SELECT * FROM b_index
UNION ALL SELECT * FROM c_allapot
UNION ALL SELECT * FROM d_fuggvenyek
ORDER BY 1, 2;
