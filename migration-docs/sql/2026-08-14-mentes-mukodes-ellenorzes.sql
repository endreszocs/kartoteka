-- ═══════════════════════════════════════════════════════════════════════════
--  A NAPI BIZTONSÁGI MENTÉS MŰKÖDÉS-ELLENŐRZÉSE (2026-08-14)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  MIÉRT EZ, ÉS NEM A MIGRÁCIÓ SAJÁT ELLENŐRZŐJE
--  A 2026-08-13-changelog-jelolesek-besorolas.sql végén lévő SELECT azt méri,
--  hogy a MIGRÁCIÓ lefutott-e. Ez a fájl mást mér: hogy a mentés VALÓBAN
--  MŰKÖDIK-E — fut-e naponta, végigmegy-e minden gyülekezeten, nem hasal-e el
--  némán, és van-e olyan gyülekezet, amelyikről rég nincs mentés.
--
--  Ez a projekt dokumentált hibaosztálya: „a migration-fájl NEM bizonyíték".
--  Ugyanígy: a „lefutott a migráció" sem bizonyíték arra, hogy a mentés jó.
--
--  ⚠️ CSAK OLVAS. Egyetlen sort sem módosít. Bármikor, bármennyiszer futtatható.
--
--  HASZNÁLAT: futtasd le a Supabase SQL Editorban, és küldd vissza az eredményt.
--  A Supabase csak az UTOLSÓ eredményhalmazt mutatja, ezért minden ellenőrzés
--  EGYETLEN SELECT-be van fűzve, „rendben" oszloppal.
-- ═══════════════════════════════════════════════════════════════════════════

WITH
-- Europe/Bucharest helyi „ma" — a backup_log.run_date is ebben él.
ma AS (
  SELECT (now() AT TIME ZONE 'Europe/Bucharest')::date AS d
),
-- Hány hatókört KELLENE menteni naponta: minden aktív gyülekezet + 1 globális.
varhato AS (
  SELECT
    (SELECT count(*) FROM public.congregations
      -- SZÁNDÉKOSAN `= 'active'` és NEM COALESCE: a mentés-motor is így szűr
      -- (lib/backup/worker.ts:594 `.eq('status','active')`), ami a NULL-t
      -- KIZÁRJA. COALESCE-szal a várt darabszám nagyobb lenne a valósnál,
      -- és ez a lekérdezés téves riasztást adna.
      WHERE status = 'active') AS gyulekezet_db
),
-- A legutolsó napi futás összesítése.
utolso_nap AS (
  SELECT max(run_date) AS d FROM public.backup_log WHERE kind = 'napi'
),
napi AS (
  SELECT
    bl.run_date,
    count(*)                                   AS osszes,
    count(*) FILTER (WHERE bl.status = 'ok')   AS sikeres,
    count(*) FILTER (WHERE bl.status = 'hiba') AS hibas,
    count(*) FILTER (WHERE bl.status = 'fut')  AS beragadt,
    min(bl.started_at)                         AS kezdes,
    max(bl.finished_at)                        AS vege
  FROM public.backup_log bl
  WHERE bl.kind = 'napi' AND bl.run_date = (SELECT d FROM utolso_nap)
  GROUP BY bl.run_date
)
SELECT sorrend, mit_mer, ertek, vart,
       CASE WHEN rendben THEN '✅' ELSE '❌' END AS rendben
FROM (
  -- ── 1. A fail-closed kapu: van-e besorolatlan élő tábla? ──────────────────
  SELECT 1 AS sorrend,
         'BESOROLATLAN ÉLŐ TÁBLA (ha > 0, a mentés EL SEM INDUL)' AS mit_mer,
         (SELECT count(*)::text FROM public.backup_live_tables() WHERE hatokor IS NULL) AS ertek,
         '0' AS vart,
         (SELECT count(*) FROM public.backup_live_tables() WHERE hatokor IS NULL) = 0 AS rendben

  -- ── 2. Visszaállítás-kapu: van-e réteg nélküli tábla? ─────────────────────
  UNION ALL SELECT 2,
         'RÉTEG NÉLKÜLI TÁBLA (mentés OK, de a VISSZAÁLLÍTÁS megtagadja)',
         (SELECT count(*)::text FROM public.backup_table_policy
           WHERE reteg IS NULL AND hatokor IS DISTINCT FROM 'kizart'),
         '0',
         (SELECT count(*) FROM public.backup_table_policy
           WHERE reteg IS NULL AND hatokor IS DISTINCT FROM 'kizart') = 0

  -- ── 3. Volt-e egyáltalán mentés az elmúlt 48 órában? ──────────────────────
  UNION ALL SELECT 3,
         'LEGUTOLSÓ NAPI MENTÉS DÁTUMA',
         COALESCE((SELECT d::text FROM utolso_nap), '<még soha nem futott>'),
         'ma vagy tegnap (' || (SELECT d::text FROM ma) || ')',
         (SELECT d FROM utolso_nap) >= (SELECT d FROM ma) - 1

  -- ── 4. A legutolsó futás VÉGIGMENT-e minden gyülekezeten? ─────────────────
  UNION ALL SELECT 4,
         'A LEGUTOLSÓ FUTÁS SIKERES HATÓKÖREI / VÁRT',
         COALESCE((SELECT sikeres::text FROM napi), '0') || ' / ' ||
           ((SELECT gyulekezet_db FROM varhato) + 1)::text,
         'a kettő egyezik',
         COALESCE((SELECT sikeres FROM napi), 0) >= (SELECT gyulekezet_db FROM varhato) + 1

  -- ── 5. Volt-e HIBÁS hatókör a legutolsó futásban? ─────────────────────────
  UNION ALL SELECT 5,
         'HIBÁVAL ZÁRULT HATÓKÖR A LEGUTOLSÓ FUTÁSBAN',
         COALESCE((SELECT hibas::text FROM napi), '0'),
         '0',
         COALESCE((SELECT hibas FROM napi), 0) = 0

  -- ── 6. BERAGADT futás („fut" státuszban maradt) ───────────────────────────
  UNION ALL SELECT 6,
         'BERAGADT (fut státuszban maradt) SOR — bármely napon',
         (SELECT count(*)::text FROM public.backup_log
           WHERE status = 'fut' AND started_at < now() - interval '6 hours'),
         '0',
         (SELECT count(*) FROM public.backup_log
           WHERE status = 'fut' AND started_at < now() - interval '6 hours') = 0

  -- ── 7. Van-e gyülekezet, amelyikről 3+ napja NINCS sikeres mentés? ────────
  UNION ALL SELECT 7,
         'GYÜLEKEZET, AMELYIKRŐL 3+ NAPJA NINCS SIKERES MENTÉS',
         (SELECT count(*)::text FROM public.congregations c
           WHERE c.status = 'active'
             AND NOT EXISTS (
               SELECT 1 FROM public.backup_log bl
                WHERE bl.congregation_id = c.id
                  AND bl.status = 'ok'
                  AND bl.run_date >= (SELECT d FROM ma) - 3)),
         '0',
         (SELECT count(*) FROM public.congregations c
           WHERE c.status = 'active'
             AND NOT EXISTS (
               SELECT 1 FROM public.backup_log bl
                WHERE bl.congregation_id = c.id
                  AND bl.status = 'ok'
                  AND bl.run_date >= (SELECT d FROM ma) - 3)) = 0

  -- ── 8. A Drive-kapcsolat állapota ─────────────────────────────────────────
  -- A refresh token TITKOSÍTVA áll (drive_refresh_token_enc bytea), ezért a
  -- meglétét és a token állapotát nézzük, nem a nyers értéket.
  UNION ALL SELECT 8,
         'DRIVE-KAPCSOLAT ÁLLAPOTA (token + hibajelző)',
         COALESCE((SELECT drive_token_status FROM public.backup_settings WHERE id = 1), '<nincs sor>')
           || CASE WHEN EXISTS (SELECT 1 FROM public.backup_settings
                                 WHERE id = 1 AND drive_refresh_token_enc IS NOT NULL)
                   THEN ' (token megvan)' ELSE ' (TOKEN HIÁNYZIK)' END,
         'ok (token megvan)',
         EXISTS (SELECT 1 FROM public.backup_settings
                  WHERE id = 1 AND drive_token_status = 'ok'
                    AND drive_refresh_token_enc IS NOT NULL)

  -- ── 8/b. A mentés egyáltalán engedélyezve van-e? ──────────────────────────
  UNION ALL SELECT 82,
         'A MENTÉS ENGEDÉLYEZVE VAN (backup_settings.enabled)',
         COALESCE((SELECT enabled::text FROM public.backup_settings WHERE id = 1), '<nincs sor>'),
         'true',
         COALESCE((SELECT enabled FROM public.backup_settings WHERE id = 1), false)

  -- ── 8/c. Van-e beállítva mentési jelszó? (enélkül nincs visszaállítás) ────
  UNION ALL SELECT 83,
         'MENTÉSI JELSZÓ BE VAN-E ÁLLÍTVA (enélkül nincs visszaállítás)',
         CASE WHEN EXISTS (SELECT 1 FROM public.backup_settings
                            WHERE id = 1 AND passphrase_verifier IS NOT NULL)
              THEN 'igen' ELSE 'NINCS' END,
         'igen',
         EXISTS (SELECT 1 FROM public.backup_settings
                  WHERE id = 1 AND passphrase_verifier IS NOT NULL)

  -- ── 9. TÁJÉKOZTATÓ — a legutolsó futás időtartama ─────────────────────────
  UNION ALL SELECT 9,
         'TÁJÉKOZTATÓ — a legutolsó futás kezdete és hossza',
         COALESCE((SELECT to_char(kezdes AT TIME ZONE 'Europe/Bucharest', 'YYYY-MM-DD HH24:MI')
                          || ' · ' || COALESCE(EXTRACT(EPOCH FROM (vege - kezdes))::int::text, '?') || ' mp'
                     FROM napi), '—'),
         '(csak tájékoztatás)',
         true

  -- ── 10. TÁJÉKOZTATÓ — mentésbe kerülő táblák megoszlása ──────────────────
  UNION ALL SELECT 10,
         'TÁJÉKOZTATÓ — élő táblák: gyülekezeti / globális / kizárt',
         (SELECT count(*) FROM public.backup_live_tables() WHERE hatokor = 'gyulekezet')::text
           || ' / ' || (SELECT count(*) FROM public.backup_live_tables() WHERE hatokor = 'globalis')::text
           || ' / ' || (SELECT count(*) FROM public.backup_live_tables() WHERE hatokor = 'kizart')::text,
         '(csak tájékoztatás)',
         true
) t
ORDER BY sorrend;


-- ═══════════════════════════════════════════════════════════════════════════
--  HA A 4., 5. VAGY 7. SOR ❌ — FUTTASD LE EZT IS, ÉS KÜLDD VISSZA:
--  (megmondja, MELYIK gyülekezet és MIÉRT bukott el)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SELECT bl.run_date,
--        COALESCE(bl.congregation_nev, '(globális)') AS hatokor,
--        bl.status,
--        bl.failure_stage,
--        left(COALESCE(bl.failure_message, ''), 200) AS hiba,
--        bl.started_at AT TIME ZONE 'Europe/Bucharest' AS kezdes
--   FROM public.backup_log bl
--  WHERE bl.status <> 'ok'
--    AND bl.run_date >= (now() AT TIME ZONE 'Europe/Bucharest')::date - 7
--  ORDER BY bl.run_date DESC, bl.started_at DESC
--  LIMIT 50;
