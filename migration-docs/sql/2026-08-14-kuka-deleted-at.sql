-- ═══════════════════════════════════════════════════════════════════════════
--  KUKA 2. ÜTEM: deleted_at + TELJES automatikus takarítás (2026-08-14, 6. pont)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  MIT OLD MEG (felmérés, 2026-08-14):
--   1) SEHOL nincs `deleted_at` oszlop → a Kuka nem tudja, MIKOR törölték a
--      sort, csak az `updated_at`-ból becsül („legfeljebb N nap"). Mostantól
--      a törlés pillanatát egy trigger bélyegzi — a felület pontos
--      visszaszámlálót mutathat.
--   2) A 2026-04-15-ös purge_recycle_bin() CSAK 7 táblát takarít. A ma
--      kukába kötött pénzügy/napló/leltár táblák (befizetes, kiadas,
--      belsomozgas, munkanaplo, leltar_tetelek) SOSEM ürültek automatikusan —
--      a „30 nap után törlődik" ígéret rájuk nem volt igaz. Mostantól mind a
--      12 soft-delete tábla takarítva van.
--   3) A takarítás HETI volt (vasárnap) → egy sor akár 36 napig is élhetett.
--      Mostantól NAPI (03:15 UTC), így a visszaszámláló napra pontos.
--   4) A régi purge táblánként EGYETLEN DELETE-et futtatott: ha AKÁR EGY sort
--      FK védett (pl. sírhelybérléshez kötött befizetés), az EGÉSZ tábla
--      takarítása elbukott — némán, örökre. Az új purge ilyenkor SORONKÉNT
--      töröl: a blokkolt sor kimarad (és jelentjük), a többi törlődik.
--
--  FONTOS VÉDELMEK:
--   · Az 5 újonnan takarított tábla RÉGI törölt sorai 30 nap türelmi időt
--     kapnak MÁTÓL (deleted_at := now()) — nehogy az első takarítás szó
--     nélkül elvigye az évek óta a kukában ülő sorokat. A 7 régi táblánál
--     deleted_at := updated_at (a mai viselkedés folytatása).
--   · A backfill a touch-triggerek (updated_at/revision) KIKAPCSOLÁSÁVAL fut,
--     így nem indít újraletöltési hullámot az offline klienseken, és a régi
--     kódú kliensek (desktop) becslője sem nullázódik 30 napra.
--
--  ⚠️ EGY TRANZAKCIÓ — vagy minden lépés lefut, vagy semmi.
--  Újrafuttatható (IF NOT EXISTS / OR REPLACE / deleted_at IS NULL őrfeltétel).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) A bélyegző trigger-függvény ────────────────────────────────────────
-- Generikus: a jelző-oszlop nevét trigger-argumentumként kapja (a
-- leltar_tetelek jelzője `is_deleted`, a többié `deleted`).
--  · flag false→true  (törlés):        deleted_at := now()
--  · flag true→false  (visszaállítás): deleted_at := NULL
--  · INSERT már törölt jelzővel (offline sync szélső eset): deleted_at := now()
-- Trigger-alapú — így MINDEN írási út bélyegez (web, desktop, kézi SQL),
-- nem múlhat a hívó fegyelmén (a szolgalati_hely_naplo mintája).
CREATE OR REPLACE FUNCTION public.kuka_deleted_at_stamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  jelzo text := TG_ARGV[0];
  regi  boolean;
  uj    boolean;
BEGIN
  uj := COALESCE((to_jsonb(NEW) ->> jelzo)::boolean, false);

  IF TG_OP = 'INSERT' THEN
    IF uj AND NEW.deleted_at IS NULL THEN
      NEW.deleted_at := now();
    END IF;
    RETURN NEW;
  END IF;

  regi := COALESCE((to_jsonb(OLD) ->> jelzo)::boolean, false);
  IF uj AND NOT regi THEN
    NEW.deleted_at := now();
  ELSIF regi AND NOT uj THEN
    NEW.deleted_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.kuka_deleted_at_stamp() IS
  '2026-08-14 (6. pont): a soft-delete jelző átbillenésekor bélyegzi/üríti a '
  'deleted_at-ot. A jelző-oszlop neve a trigger argumentuma.';

-- ─── 2) Oszlop + backfill + trigger mind a 12 táblára ──────────────────────
-- Védekező: ha egy tábla vagy a jelző-oszlopa nem létezik az ÉLŐ sémában,
-- HANGOS figyelmeztetéssel kihagyjuk (a „migration-fájl nem bizonyíték"
-- tanulsága) — az ellenőrző lekérdezés a végén ❌-szel mutatja.
DO $$
DECLARE
  -- (tabla, jelzo-oszlop, backfill-mod)
  terv text[][] := ARRAY[
    -- 2026-04-15 óta takarított táblák: a számláló a mai viselkedést örökli
    -- (deleted_at := updated_at — a purge eddig is ebből számolt)
    ARRAY['berleti_szerzodes', 'deleted',    'updated_at'],
    ARRAY['iktato',            'deleted',    'updated_at'],
    ARRAY['iktato_sablonok',   'deleted',    'updated_at'],
    ARRAY['sirhelytemeto',     'deleted',    'updated_at'],
    ARRAY['sirhely',           'deleted',    'updated_at'],
    ARRAY['sirhelyberles',     'deleted',    'updated_at'],
    ARRAY['sirhelyelhunyt',    'deleted',    'updated_at'],
    -- 2026-08-14-ben kukába kötött táblák: EDDIG SOSEM ürültek → a régi
    -- törölt sorok 30 nap türelmi időt kapnak MÁTÓL (deleted_at := now())
    ARRAY['befizetes',         'deleted',    'most'],
    ARRAY['kiadas',            'deleted',    'most'],
    ARRAY['belsomozgas',       'deleted',    'most'],
    ARRAY['munkanaplo',        'deleted',    'most'],
    ARRAY['leltar_tetelek',    'is_deleted', 'most']
  ];
  sor         text[];
  v_tabla     text;
  v_jelzo     text;
  v_mod       text;
  van_updated boolean;
BEGIN
  FOREACH sor SLICE 1 IN ARRAY terv LOOP
    v_tabla := sor[1]; v_jelzo := sor[2]; v_mod := sor[3];

    IF to_regclass('public.' || v_tabla) IS NULL THEN
      RAISE WARNING 'kuka-deleted_at: a(z) % tábla NEM létezik az élő sémában — kihagyva!', v_tabla;
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = v_tabla AND column_name = v_jelzo
    ) THEN
      RAISE WARNING 'kuka-deleted_at: a(z) %.% jelző-oszlop NEM létezik — kihagyva!', v_tabla, v_jelzo;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at timestamptz', v_tabla);

    -- Backfill CSAK az üres deleted_at-ú, törölt-jelzős sorokra (újrafuttatható).
    -- A user-triggereket (sync_tracking_touch: updated_at/revision bump) a
    -- backfill idejére KIKAPCSOLJUK — enélkül minden soft-törölt sor
    -- „módosulna", és a migráció utáni első szinkron minden gépen újra
    -- letöltené az összes kukában ülő sort, a régi kódú kliensek (desktop)
    -- becslője pedig 30 napra nullázódna. Az ALTER TABLE amúgy is exkluzív
    -- zárat fog (az ADD COLUMN miatt), ez nem ad újat hozzá. FK-ellenőrzést
    -- ez NEM érint (azok belső triggerek), és a tranzakció végéig vissza is
    -- kapcsoljuk.
    van_updated := EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = v_tabla AND column_name = 'updated_at'
    );
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', v_tabla);
    IF v_mod = 'updated_at' AND van_updated THEN
      EXECUTE format(
        'UPDATE public.%I SET deleted_at = COALESCE(updated_at, now()) WHERE %I = true AND deleted_at IS NULL',
        v_tabla, v_jelzo);
    ELSE
      EXECUTE format(
        'UPDATE public.%I SET deleted_at = now() WHERE %I = true AND deleted_at IS NULL',
        v_tabla, v_jelzo);
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', v_tabla);

    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'kuka_deleted_at_' || v_tabla, v_tabla);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.kuka_deleted_at_stamp(%L)',
      'kuka_deleted_at_' || v_tabla, v_tabla, v_jelzo);
  END LOOP;
END;
$$;

-- ─── 3) purge_recycle_bin() — MIND A 12 tábla, deleted_at alapján ──────────
-- A 2026-04-15-ös változatot váltja. Változások:
--  · a `deleted_at IS NOT NULL` feltétel fail-closed: bélyegzetlen sort SOHA
--    nem töröl;
--  · FK-VÉDETT SOROK: a gyors, tömeges DELETE hibájánál SORONKÉNTI
--    tartalék-ág fut — a blokkolt sor kimarad (skipped_count jelenti), a
--    többi törlődik. A régi kód ilyenkor az EGÉSZ táblát átugrotta, némán
--    és minden nap újra (bizonyítottan élő eset: sirhelyberles.befizetesid →
--    befizetes; kiadasikiseroiv.id_kiadas → kiadas);
--  · GYEREK-ELŐSZÖR sorrend (sirhelyelhunyt → sirhelyberles → sirhely →
--    sirhelytemeto, a befizetes a sirhelyberles után), hogy az egymásra
--    mutató sorok EGY futásban tisztuljanak, ne napok alatt;
--  · hibás tábla is megjelenik az eredményben (deleted_count = -1), nem
--    tűnik el szó nélkül.
-- A visszatérési oszlopok bővültek → a régi függvényt el kell dobni.
DROP FUNCTION IF EXISTS public.purge_recycle_bin();

CREATE FUNCTION public.purge_recycle_bin()
RETURNS table(tbl text, deleted_count bigint, skipped_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  terv text[][] := ARRAY[
    ARRAY['berleti_szerzodes', 'deleted'],
    ARRAY['iktato',            'deleted'],
    ARRAY['iktato_sablonok',   'deleted'],
    -- sírhely-blokk gyerek-először (FK: sirhelyelhunyt.sirhelyid → sirhely,
    -- sirhelyberles.sirhelyid → sirhely, sirhely.temetoid → sirhelytemeto)
    ARRAY['sirhelyelhunyt',    'deleted'],
    ARRAY['sirhelyberles',     'deleted'],
    ARRAY['sirhely',           'deleted'],
    ARRAY['sirhelytemeto',     'deleted'],
    -- a befizetes a sirhelyberles UTÁN (FK: sirhelyberles.befizetesid → befizetes)
    ARRAY['befizetes',         'deleted'],
    ARRAY['kiadas',            'deleted'],
    ARRAY['belsomozgas',       'deleted'],
    ARRAY['munkanaplo',        'deleted'],
    ARRAY['leltar_tetelek',    'is_deleted']
    -- Ha új soft-delete tábla jön: ide ÉS a 2) szakasz tervébe is fel kell venni!
  ];
  sor      text[];
  v_tabla  text;
  v_jelzo  text;
  v_id     record;
BEGIN
  FOREACH sor SLICE 1 IN ARRAY terv LOOP
    v_tabla := sor[1]; v_jelzo := sor[2];
    tbl := v_tabla; deleted_count := 0; skipped_count := 0;
    BEGIN
      -- Gyors út: egyetlen tömeges DELETE.
      EXECUTE format(
        'DELETE FROM public.%I WHERE %I = true AND deleted_at IS NOT NULL AND deleted_at < now() - interval ''30 days''',
        v_tabla, v_jelzo);
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
      -- Tartalék út: SORONKÉNT — ami törölhető, törlődjön; a védett sor
      -- kimarad és számoljuk. Egy beragadt sor így NEM tartja túszul a
      -- tábla többi 30+ napos sorát.
      BEGIN
        deleted_count := 0;
        FOR v_id IN EXECUTE format(
          'SELECT id FROM public.%I WHERE %I = true AND deleted_at IS NOT NULL AND deleted_at < now() - interval ''30 days''',
          v_tabla, v_jelzo)
        LOOP
          BEGIN
            EXECUTE format('DELETE FROM public.%I WHERE id = $1', v_tabla) USING v_id.id;
            deleted_count := deleted_count + 1;
          EXCEPTION WHEN OTHERS THEN
            skipped_count := skipped_count + 1;
          END;
        END LOOP;
        IF skipped_count > 0 THEN
          RAISE WARNING 'purge_recycle_bin: a(z) % táblában % sor törlését hivatkozás védi — kimaradtak.', v_tabla, skipped_count;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Ha maga a listázás bukik (pl. hiányzó deleted_at oszlop), a tábla
        -- -1-gyel jelenik meg — de a TÖBBI tábla takarítása megy tovább.
        RAISE WARNING 'purge_recycle_bin: a(z) % tábla takarítása sikertelen: %', v_tabla, SQLERRM;
        deleted_count := -1;
      END;
    END;
    -- MINDEN tábla megjelenik az eredményben (hibánál deleted_count = -1).
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.purge_recycle_bin() IS
  '2026-08-14 (6. pont): a 30 napnál régebben törölt (deleted_at) sorok végleges '
  'törlése mind a 12 soft-delete táblából. FK-védett sor kimarad (skipped_count), '
  'nem blokkolja a többit. Naponta fut pg_cron-nal (03:15 UTC).';

-- Jogosultságok: csak a service_role / pg_cron futtathatja.
REVOKE ALL ON FUNCTION public.purge_recycle_bin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_recycle_bin() FROM anon;
REVOKE ALL ON FUNCTION public.purge_recycle_bin() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_recycle_bin() TO service_role;

-- ─── 4) Cron: hetiről NAPIRA (03:15 UTC) ───────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    PERFORM cron.unschedule('kartoteka_recycle_bin_cleanup')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kartoteka_recycle_bin_cleanup');

    -- Napi 03:15 UTC — a napi mentés (05:17) ELŐTT, hogy a mentésben már a
    -- kitakarított állapot legyen; és hajnalban, amikor senki nem dolgozik.
    PERFORM cron.schedule(
      'kartoteka_recycle_bin_cleanup',
      '15 3 * * *',
      $cronsql$SELECT public.purge_recycle_bin();$cronsql$
    );

    RAISE NOTICE 'Kuka takarítás átütemezve: NAPI 03:15 UTC';
  ELSE
    RAISE WARNING 'pg_cron nem érhető el — a Kuka takarítás MANUÁLIS: SELECT public.purge_recycle_bin();';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pg_cron átütemezés sikertelen: % — a purge_recycle_bin() attól még működik.', SQLERRM;
END;
$$;

COMMIT;

-- ─── ELLENŐRZÉS 1 (csak olvas): oszlop + trigger táblánként ────────────────
WITH terv(tabla) AS (
  VALUES ('berleti_szerzodes'), ('iktato'), ('iktato_sablonok'),
         ('sirhelytemeto'), ('sirhely'), ('sirhelyberles'), ('sirhelyelhunyt'),
         ('befizetes'), ('kiadas'), ('belsomozgas'), ('munkanaplo'), ('leltar_tetelek')
)
SELECT
  t.tabla,
  CASE WHEN c.column_name IS NOT NULL THEN '✅' ELSE '❌ NINCS deleted_at' END AS deleted_at_oszlop,
  CASE WHEN tg.tgname     IS NOT NULL THEN '✅' ELSE '❌ NINCS trigger'    END AS belyegzo_trigger,
  CASE WHEN tg.tgenabled = 'O'        THEN '✅' ELSE '❌ trigger NEM aktív' END AS trigger_aktiv
FROM terv t
LEFT JOIN information_schema.columns c
       ON c.table_schema = 'public' AND c.table_name = t.tabla AND c.column_name = 'deleted_at'
LEFT JOIN pg_trigger tg
       ON tg.tgrelid = to_regclass('public.' || t.tabla)
      AND tg.tgname  = 'kuka_deleted_at_' || t.tabla
      AND NOT tg.tgisinternal
ORDER BY t.tabla;

-- ─── ELLENŐRZÉS 2 (csak olvas): purge-függvény + napi cron ─────────────────
-- Ha ez a lekérdezés „cron.job does not exist" hibát ad, a pg_cron nincs
-- bekapcsolva — akkor a takarítást kézzel kell futtatni, szólj!
SELECT 1 AS sorrend,
       'A purge már az új táblákat is takarítja' AS mit_mer,
       CASE WHEN pg_get_functiondef('public.purge_recycle_bin()'::regprocedure) LIKE '%leltar_tetelek%'
             AND pg_get_functiondef('public.purge_recycle_bin()'::regprocedure) LIKE '%befizetes%'
            THEN '✅' ELSE '❌' END AS rendben
UNION ALL
SELECT 2,
       'FK-védett sor nem blokkolja a táblát (skipped_count ág)',
       CASE WHEN pg_get_function_result('public.purge_recycle_bin()'::regprocedure) LIKE '%skipped_count%'
            THEN '✅' ELSE '❌' END
UNION ALL
SELECT 3,
       'Napi takarítás ütemezve (15 3 * * *)',
       COALESCE((SELECT CASE WHEN j.schedule = '15 3 * * *' THEN '✅'
                             ELSE '⚠️ más ütem: ' || j.schedule END
                   FROM cron.job j WHERE j.jobname = 'kartoteka_recycle_bin_cleanup'),
                '❌ nincs cron job')
ORDER BY sorrend;

-- ─── (OPCIONÁLIS) PRÓBAFUTTATÁS ────────────────────────────────────────────
-- Ez TÉNYLEGESEN töröl minden 30+ napja törölt sort (az 5 új táblán a türelmi
-- idő miatt még nincs ilyen). Az eredményben mind a 12 táblának szerepelnie
-- kell; skipped_count > 0 = hivatkozás által védett, bennmaradó sorok.
-- SELECT * FROM public.purge_recycle_bin();
