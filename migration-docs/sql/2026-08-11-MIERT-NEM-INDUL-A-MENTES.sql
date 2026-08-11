-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTÉKA — „MIÉRT NEM INDUL EL A MENTÉS?"
-- Fájl:     migration-docs/sql/2026-08-11-MIERT-NEM-INDUL-A-MENTES.sql
-- Dátum:    2026-08-11
-- Futtatja: Endre (Supabase Studio → SQL Editor). EGYBEN futtatható.
--
-- ⚠️ EZ A FÁJL CSAK OLVAS. Nincs benne INSERT, UPDATE, DELETE, CREATE, DROP.
--    Nem foglal napló-sort, nem tölt fel fájlt, nem változtat semmit.
--    Bármikor, bármennyiszer lefuttatható.
--
-- ─── MIÉRT SZÜLETETT ────────────────────────────────────────────────────────
--  2026-08-11-én a „Mentés most" gomb ennyit mondott:
--
--        „A biztonsági mentés futása sikertelen."
--
--  Se lépés, se ok, se teendő. A felület némasága azóta JAVÍTVA van (mostantól
--  megmutatja, melyik lépésnél állt meg és mit kell tenni) — DE az a javítás
--  csak a következő telepítés után él. EZ A LEKÉRDEZÉS MOST, AZONNAL megmondja
--  ugyanazt, telepítés nélkül.
--
-- ─── HOGYAN OLVASD ──────────────────────────────────────────────────────────
--  A Studio csak az UTOLSÓ eredményt mutatja, ezért minden ellenőrzés EGYETLEN
--  SELECT-be van fűzve. A `sorrend` oszlop a MENTÉS TÉNYLEGES LÉPÉS-SORRENDJE:
--  az ELSŐ ❌ az, ami megállítja a futást. Ami utána jön, addig el sem jut.
--
--        1..7   — a hat előkészítő lépés (a hatókör-ciklus ELŐTT)
--        8..12  — tények, amikből cselekedni lehet
--        99     — AZ ÍTÉLET: mehet-e a mentés, és ha nem, mi a teendő
--
--  A 99-es sort olvasd el ELŐSZÖR. Ha ott „MEHET" áll, a mentés el fog indulni.
--
-- ⛔ TITOK NEM JELENIK MEG. A Drive refresh tokenről és a mentési jelszóról
--    kizárólag azt írjuk ki, hogy VAN-E — sem értéket, sem hosszt, sem előtagot.
--
-- ─── HA A LEKÉRDEZÉS AZONNAL HIBÁRA FUT ─────────────────────────────────────
--  Ha ilyen hibát kapsz:
--        ERROR: relation "public.backup_table_policy" does not exist
--  akkor MEGVAN A VÁLASZ, és nem kell tovább nyomozni: a mentés adatbázis-része
--  egyáltalán nincs telepítve. Teendő: futtasd le a
--        migration-docs/sql/2026-08-11-biztonsagi-mentes.sql
--  fájlt, utána a
--        migration-docs/sql/2026-08-11-mentes-tabla-besorolas.sql
--  fájlt, majd futtasd le ÚJRA ezt az ellenőrzést.
--  (A Postgres a táblaneveket a lekérdezés ELEMZÉSEKOR oldja fel, ezért erre az
--   esetre nem lehet szép „hiányzik" sort adni — a hibaüzenet maga a válasz.)
-- ════════════════════════════════════════════════════════════════════════════

WITH
-- ── Léteznek-e egyáltalán a mentés adatbázis-objektumai? ───────────────────
-- Ha a `backup_table_policy` nincs meg, minden más ellenőrzés hibára futna,
-- ezért mindenütt `to_regclass`/`to_regprocedure` őrszemet használunk.
-- ⚠️ A FÜGGVÉNYEKET NÉV SZERINT keressük (`pg_proc`), NEM `to_regprocedure`-rel.
--    A `to_regprocedure` PONTOS argumentum-listát vár: ha egy paraméter típusa
--    valaha változik, NULL-t adna, és ez az ellenőrzés hamisan azt mondaná,
--    hogy „hiányzik a függvény". Egy diagnosztika, ami rossz irányba küld,
--    rosszabb, mint a semmi.
alap AS (
  SELECT
    to_regclass('public.backup_table_policy') IS NOT NULL AS van_policy,
    to_regclass('public.backup_settings')     IS NOT NULL AS van_settings,
    to_regclass('public.backup_log')          IS NOT NULL AS van_log,
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname='public' AND p.proname='backup_live_tables')      AS van_leltar_rpc,
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname='public' AND p.proname='backup_count_table')      AS van_count_rpc,
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname='public' AND p.proname='backup_dump_table')       AS van_dump_rpc,
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname='public' AND p.proname='backup_scope_where')      AS van_scope_rpc,
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname='public' AND p.proname='backup_restore_cleanup')  AS van_cleanup_rpc
),

-- ── Élő táblák (ez az igazság-forrás, NEM a repó) ──────────────────────────
elo AS (
  SELECT t.table_name::text AS tabla
  FROM information_schema.tables t
  WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
),

-- ── 1. KAPU: besorolatlan élő tábla ────────────────────────────────────────
-- A mentés FAIL-CLOSED: amíg akár EGY élő tábla besorolatlan, EL SEM INDUL.
-- Ez szándékos — a néma kihagyás a legrosszabb kimenet.
besorolatlan AS (
  SELECT e.tabla
  FROM elo e
  WHERE (SELECT van_policy FROM alap)
    AND NOT EXISTS (
      SELECT 1 FROM public.backup_table_policy p
      WHERE p.tabla = e.tabla AND p.hatokor IS NOT NULL
    )
),

-- ── 2. KAPU: gyülekezeti tábla ÉRVÉNYES SZŰRŐ nélkül ───────────────────────
-- Nincs `join_predikatum` ÉS nincs `congregation_id` oszlop → a szűrő egy nem
-- létező oszlopra hivatkozna, és MINDEN gyülekezet mentése elhasalna.
szuro_nelkul AS (
  SELECT p.tabla
  FROM public.backup_table_policy p
  WHERE (SELECT van_policy FROM alap)
    AND p.hatokor = 'gyulekezet'
    AND (p.join_predikatum IS NULL OR btrim(p.join_predikatum) = '')
    AND EXISTS (SELECT 1 FROM elo e WHERE e.tabla = p.tabla)
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = p.tabla
        AND c.column_name = 'congregation_id'
    )
),

-- ── 3. KAPU: HIBÁS szűrő — nem létező oszlopra hivatkozik ──────────────────
-- ⚠️ Ezt a 2. kapu NEM fogja meg: az csak a HIÁNYZÓ szűrőt nézi, a HIBÁSAT nem.
--    Éles példa: `congregation_transfers` → `t.source_congregation_id` — ilyen
--    oszlopa NINCS (a `member_transfer_notifications`-é). A `backup_count_table`
--    emiatt 42703-ra futna, gyülekezetenként külön.
hibas_szuro AS (
  SELECT DISTINCT p.tabla, m.oszlop[1] AS nemletezo_oszlop
  FROM public.backup_table_policy p
  CROSS JOIN LATERAL regexp_matches(p.join_predikatum, '\mt\.([a-z_][a-z0-9_]*)', 'g') AS m(oszlop)
  WHERE (SELECT van_policy FROM alap)
    AND p.join_predikatum IS NOT NULL
    AND EXISTS (SELECT 1 FROM elo e WHERE e.tabla = p.tabla)
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = p.tabla
        AND c.column_name = m.oszlop[1]
    )
),

-- ── A mai nap állapota ─────────────────────────────────────────────────────
ma AS (
  SELECT (now() AT TIME ZONE 'Europe/Bucharest')::date AS nap
),
mai_naplo AS (
  SELECT
    count(*) FILTER (WHERE l.status = 'ok' AND l.drive_verified_at IS NOT NULL) AS igazolt,
    count(*) FILTER (WHERE l.status = 'hiba')                                    AS hibas,
    count(*) FILTER (WHERE l.status = 'fut')                                     AS befejezetlen,
    count(*)                                                                     AS osszes_sor
  FROM public.backup_log l, ma
  WHERE (SELECT van_log FROM alap) AND l.run_date = ma.nap
),
varhato AS (
  SELECT count(*) + 1 AS db   -- + a rendszerszintű (globális) hatókör
  FROM public.congregations WHERE status = 'active'
),

-- ── AZ ÍTÉLET ──────────────────────────────────────────────────────────────
itelet AS (
  SELECT
    CASE
      WHEN NOT (SELECT van_policy FROM alap)
        OR NOT (SELECT van_leltar_rpc FROM alap)
        OR NOT (SELECT van_count_rpc FROM alap)
        OR NOT (SELECT van_dump_rpc FROM alap)
        THEN 'NEM MEHET — a mentes adatbazis-resze nincs (teljesen) telepitve'
      WHEN (SELECT count(*) FROM besorolatlan) > 0
        THEN 'NEM MEHET — ' || (SELECT count(*) FROM besorolatlan)::text || ' besorolatlan elo tabla'
      WHEN (SELECT count(*) FROM szuro_nelkul) > 0
        THEN 'NEM MEHET — ' || (SELECT count(*) FROM szuro_nelkul)::text || ' gyulekezeti tabla ervenyes szuro nelkul'
      WHEN (SELECT count(*) FROM hibas_szuro) > 0
        THEN 'NEM MEHET — ' || (SELECT count(*) FROM hibas_szuro)::text || ' tabla szuroje nemletezo oszlopra hivatkozik'
      ELSE 'MEHET — az adatbazis oldalan minden elofeltetel teljesul'
    END AS verdikt
)

SELECT * FROM (
  -- ══ A HAT ELŐKÉSZÍTŐ LÉPÉS, A MENTÉS SORRENDJÉBEN ════════════════════════
  SELECT 1 AS sorrend,
         'Mentes-tablak es RPC-k'::text AS lepes,
         CASE WHEN (SELECT van_policy FROM alap) AND (SELECT van_settings FROM alap)
                   AND (SELECT van_log FROM alap) AND (SELECT van_leltar_rpc FROM alap)
                   AND (SELECT van_count_rpc FROM alap) AND (SELECT van_dump_rpc FROM alap)
                   AND (SELECT van_scope_rpc FROM alap) AND (SELECT van_cleanup_rpc FROM alap)
              THEN 'OK' ELSE 'HIANYZIK' END::text AS allapot,
         COALESCE(NULLIF(concat_ws(', ',
           CASE WHEN NOT (SELECT van_policy    FROM alap) THEN 'backup_table_policy' END,
           CASE WHEN NOT (SELECT van_settings  FROM alap) THEN 'backup_settings' END,
           CASE WHEN NOT (SELECT van_log       FROM alap) THEN 'backup_log' END,
           CASE WHEN NOT (SELECT van_leltar_rpc  FROM alap) THEN 'backup_live_tables()' END,
           CASE WHEN NOT (SELECT van_count_rpc   FROM alap) THEN 'backup_count_table()' END,
           CASE WHEN NOT (SELECT van_dump_rpc    FROM alap) THEN 'backup_dump_table()' END,
           CASE WHEN NOT (SELECT van_scope_rpc   FROM alap) THEN 'backup_scope_where()' END,
           CASE WHEN NOT (SELECT van_cleanup_rpc FROM alap) THEN 'backup_restore_cleanup()' END
         ), ''), 'mind a 8 objektum megvan')::text AS reszlet,
         'Ha barmi hianyzik: futtasd le a 2026-08-11-biztonsagi-mentes.sql fajlt.'::text AS teendo

  UNION ALL
  SELECT 2, 'Tabla-leltar (elo public tablak)',
         CASE WHEN (SELECT count(*) FROM elo) > 0 THEN 'OK' ELSE 'URES' END,
         (SELECT count(*)::text || ' elo tabla' FROM elo),
         'Ures leltar lehetetlen egy mukodo adatbazisban.'

  -- ⚠️ EZ A LEGVALOSZINUBB BUKASI PONT (2026-08-11). Ha itt sor van, a mentes
  --    EL SEM INDUL — pontosan a megfigyelt tunettel: azonnali „sikertelen",
  --    nulla naplo-sor, 784-bol 0 igazolt.
  UNION ALL
  SELECT 3, 'KAPU 1: besorolatlan elo tabla',
         CASE WHEN (SELECT count(*) FROM besorolatlan) = 0 THEN 'OK' ELSE 'EZ ALLITJA MEG A MENTEST' END,
         COALESCE((SELECT count(*)::text || ' db: ' || string_agg(b.tabla, ', ' ORDER BY b.tabla) FROM besorolatlan b), '0 db'),
         'Futtasd le a 2026-08-11-mentes-tabla-besorolas.sql fajlt.'

  UNION ALL
  SELECT 4, 'KAPU 2: gyulekezeti tabla ervenyes szuro nelkul',
         CASE WHEN (SELECT count(*) FROM szuro_nelkul) = 0 THEN 'OK' ELSE 'EZ ALLITJA MEG A MENTEST' END,
         COALESCE((SELECT count(*)::text || ' db: ' || string_agg(s.tabla, ', ' ORDER BY s.tabla) FROM szuro_nelkul s), '0 db'),
         'Futtasd le a 2026-08-11-mentes-tabla-besorolas.sql fajlt.'

  UNION ALL
  SELECT 5, 'KAPU 3: szuro nemletezo oszlopra hivatkozik',
         CASE WHEN (SELECT count(*) FROM hibas_szuro) = 0 THEN 'OK' ELSE 'MINDEN GYULEKEZET MENTESE BUKNA' END,
         COALESCE((SELECT string_agg(h.tabla || '.' || h.nemletezo_oszlop, ', ' ORDER BY h.tabla) FROM hibas_szuro h), '0 db'),
         'Futtasd le a 2026-08-11-mentes-tabla-besorolas.sql fajlt.'

  UNION ALL
  SELECT 6, 'Tarolo: Google Drive osszekotve',
         CASE WHEN NOT (SELECT van_settings FROM alap) THEN 'NEM TUDNI'
              WHEN (SELECT count(*) FROM public.backup_settings s
                    WHERE s.drive_refresh_token_enc IS NOT NULL
                      AND s.drive_folder_id IS NOT NULL) > 0 THEN 'OK'
              ELSE 'NINCS' END,
         -- ⛔ CSAK a TENY es a fiok cime — a token SOHA (sem ertek, sem hossz).
         COALESCE((SELECT 'fiok: ' || COALESCE(s.drive_account_email, '(nincs)') ||
                          ' | token-allapot: ' || s.drive_token_status ||
                          ' | van celmappa: ' || CASE WHEN s.drive_folder_id IS NOT NULL THEN 'igen' ELSE 'nem' END
                   FROM public.backup_settings s WHERE s.id = 1), '(nincs beallitas-sor)'),
         'Ha NINCS: a mentes a Supabase Storage-ba menne — ugyanabba a fiokba, ahol az adatbazis.'

  UNION ALL
  SELECT 7, 'Helyreallito kulcs (mentesi jelszo)',
         CASE WHEN NOT (SELECT van_settings FROM alap) THEN 'NEM TUDNI'
              WHEN (SELECT count(*) FROM public.backup_settings s
                    WHERE s.recovery_public_key IS NOT NULL
                      AND s.recovery_private_wrapped IS NOT NULL) > 0 THEN 'OK'
              ELSE 'NINCS' END,
         -- ⛔ CSAK a TENY. A jelszo es a burkolt kulcs SOHA nem jelenik meg.
         COALESCE((SELECT CASE WHEN s.passphrase_set_at IS NOT NULL
                               THEN 'jelszo beallitva: ' || s.passphrase_set_at::date::text
                               ELSE 'nincs mentesi jelszo' END
                   FROM public.backup_settings s WHERE s.id = 1), '(nincs beallitas-sor)'),
         'Ez NEM allitja meg a mentest, de nelkule a fajlokat CSAK a szerver kulcsa nyitja.'

  -- ══ TÉNYEK, AMIKBŐL CSELEKEDNI LEHET ═════════════════════════════════════
  UNION ALL
  SELECT 8, 'Varhato hatokorok szama',
         'TENY',
         (SELECT db::text || ' (aktiv gyulekezet + 1 rendszerszintu)' FROM varhato),
         'Ennyi hatokornek kell mentes MINDEN nap.'

  UNION ALL
  SELECT 9, 'MAI naplo-sorok',
         CASE WHEN (SELECT osszes_sor FROM mai_naplo) = 0 THEN 'EGYETLEN SOR SINCS' ELSE 'VAN' END,
         (SELECT 'igazolt: ' || igazolt || ' | hibas: ' || hibas ||
                 ' | befejezetlen: ' || befejezetlen || ' | osszes sor: ' || osszes_sor
          FROM mai_naplo),
         'NULLA sor = a futas a hatokor-ciklus ELOTT hasalt el (elokeszito fazis).'

  UNION ALL
  SELECT 10, 'Legutobbi IGAZOLT mentes',
         CASE WHEN (SELECT count(*) FROM public.backup_log l
                    WHERE (SELECT van_log FROM alap)
                      AND l.status='ok' AND l.drive_verified_at IS NOT NULL) > 0
              THEN 'VAN' ELSE 'MEG EGYETLEN SEM' END,
         COALESCE((SELECT max(l.drive_verified_at)::text FROM public.backup_log l
                   WHERE l.status='ok' AND l.drive_verified_at IS NOT NULL), '—'),
         'Csak a drive_verified_at szamit igazolasnak — a status=ok onmagaban NEM eleg.'

  UNION ALL
  SELECT 11, 'Utolso 5 HIBAS naplo-sor (ok is)',
         'TENY',
         COALESCE((SELECT string_agg(u.sor, ' ;; ') FROM (
             SELECT COALESCE(l.congregation_nev, l.scope) || ' [' ||
                    COALESCE(l.failure_stage, '?') || ']: ' ||
                    left(COALESCE(l.failure_message, '(nincs uzenet)'), 160) AS sor
             FROM public.backup_log l
             WHERE l.status = 'hiba'
             ORDER BY l.id DESC LIMIT 5
           ) u), '(nincs hibas sor)'),
         'Ha itt van sor, a felulet „Mentesi elozmeny" listaja is mutatja, reszletesen.'

  UNION ALL
  SELECT 12, 'Besorolas-osszesito',
         'TENY',
         COALESCE((SELECT 'gyulekezeti: ' || count(*) FILTER (WHERE p.hatokor='gyulekezet') ||
                          ' | globalis: '  || count(*) FILTER (WHERE p.hatokor='globalis') ||
                          ' | kizart: '    || count(*) FILTER (WHERE p.hatokor LIKE 'kizart%')
                   FROM public.backup_table_policy p
                   WHERE (SELECT van_policy FROM alap)), '(nincs policy tabla)'),
         'A gyulekezeti tablak szama hatarozza meg, mennyi ideig tart EGY gyulekezet mentese.'

  -- ══ AZ ÍTÉLET — EZT OLVASD ELŐSZÖR ═══════════════════════════════════════
  UNION ALL
  SELECT 99, '>>> ITELET <<<',
         (SELECT verdikt FROM itelet),
         CASE WHEN (SELECT verdikt FROM itelet) LIKE 'MEHET%'
              THEN 'Nyomd meg a „Mentes most" gombot. 784 hatokornel a futas SZELETEKBEN halad — a felulet mutatja, mennyi van hatra.'
              ELSE 'Futtasd le a lenti fajlt EGYBEN, majd futtasd le UJRA ezt az ellenorzest.' END,
         CASE WHEN (SELECT verdikt FROM itelet) LIKE 'MEHET%'
              THEN '(nincs teendo)'
              WHEN NOT (SELECT van_policy FROM alap) OR NOT (SELECT van_leltar_rpc FROM alap)
              THEN 'migration-docs/sql/2026-08-11-biztonsagi-mentes.sql'
              ELSE 'migration-docs/sql/2026-08-11-mentes-tabla-besorolas.sql' END
) x
ORDER BY x.sorrend;

-- ════════════════════════════════════════════════════════════════════════════
-- === ENDRE, EZ A DOLGOD ===
-- ════════════════════════════════════════════════════════════════════════════
--  1) Nézd meg a 99-es sort. Ha „MEHET" áll ott, az adatbázis oldalán minden
--     rendben van — nyomd meg a „Mentés most" gombot.
--
--  2) Ha „NEM MEHET": az utolsó oszlop MEGNEVEZI a lefuttatandó SQL-fájlt.
--     Futtasd le EGYBEN a Supabase SQL-szerkesztőjében, majd futtasd le ÚJRA
--     ezt az ellenőrzést. A 99-es sornak ekkor „MEHET"-re kell váltania.
--
--  3) A 3., 4. és 5. sor NÉVVEL sorolja fel a hibás táblákat. Ha a 3. soron
--     olyan tábla áll, ami a pótló SQL-ben sincs benne, az AZÓTA született —
--     akkor a 2026-08-11-mentes-tabla-besorolas.sql végén lévő INSERT-sablonnal
--     kézzel kell besorolni. Ne kerüld meg: a besorolatlan tábla azt jelenti,
--     hogy senki nem döntötte el, bekerüljön-e az adat a mentésbe.
--
--  4) A 9-es sor a legárulkodóbb: ha MA egyetlen napló-sor sincs, a futás a
--     hatókör-ciklus ELŐTT hasalt el. Ilyenkor a hiba MINDIG a 3-7. sorok
--     valamelyike — ott keresd, ne a gyülekezeteknél.
-- ════════════════════════════════════════════════════════════════════════════
