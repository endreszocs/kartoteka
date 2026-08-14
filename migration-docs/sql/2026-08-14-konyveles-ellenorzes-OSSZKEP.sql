-- ═══════════════════════════════════════════════════════════════════════════
--  KÖNYVELÉS 2026 — ÖSSZKÉP EGYETLEN FUTTATÁSSAL (2026-08-14)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  MIÉRT: a 97 blokkos ellenőrző fájlt egyben futtatva a Supabase csak az
--  UTOLSÓ eredményt mutatja. Ez a fájl a legfontosabb ellenőrzéseket EGYETLEN
--  lekérdezésbe fűzi — egyszer futtatod, egy táblázatot kapsz vissza.
--
--  Minden sor: melyik blokk · mit mér · mért érték · várt érték · ✅/❌.
--  Ahol ❌ áll, ott a 97 blokkos fájl azonos számú blokkja adja a RÉSZLETEKET
--  (azt az egy blokkot futtasd le külön, és küldd vissza).
--
--  ⚠️ CSAK OLVAS. A 2026-os évre szűr.
-- ═══════════════════════════════════════════════════════════════════════════

WITH
ervenyes_kiadas AS (
  SELECT k.congregation_id, k.datum::date AS datum, k.bankszamla_id,
         COALESCE(k.osszeg_ron, k.osszeg)::numeric AS osszeg_ron,
         k.atvevo, k.id_kiadascel
    FROM public.kiadas k
   WHERE k.deleted = false AND COALESCE(k.stornozott, false) = false
     AND k.datum::date >= DATE '2026-01-01' AND k.datum::date < DATE '2027-01-01'
),
ervenyes_befizetes AS (
  SELECT b.congregation_id, b.datum::date AS datum, b.bankszamla_id,
         COALESCE(b.osszeg_ron, b.osszeg)::numeric AS osszeg_ron,
         b.forrasa, b.id_befizetescel
    FROM public.befizetes b
   WHERE b.deleted = false AND COALESCE(b.stornozott, false) = false
     AND b.datum::date >= DATE '2026-01-01' AND b.datum::date < DATE '2027-01-01'
)
SELECT blokk, mit_mer, ertek, vart,
       CASE WHEN rendben THEN '✅' ELSE '❌' END AS rendben
FROM (

  -- ── [K] Katalógus-épség ──────────────────────────────────────────────────
  SELECT '[6.katalogus]' AS blokk,
         'A 87 hivatalos költségvetési kód megvan a szamadasicel-ben' AS mit_mer,
         (SELECT count(*)::text FROM public.szamadasicel
           WHERE id ~ '^(10[1-7]|20[1-7])\.[0-9]{1,2}$') AS ertek,
         '87' AS vart,
         (SELECT count(*) FROM public.szamadasicel
           WHERE id ~ '^(10[1-7]|20[1-7])\.[0-9]{1,2}$') = 87 AS rendben

  -- ── [7.5] Besorolatlan tételek (jogcím nélkül) ───────────────────────────
  UNION ALL SELECT '[7.5]',
         'Jogcím nélküli tétel 2026-ban (befizetés + kiadás)',
         ((SELECT count(*) FROM ervenyes_befizetes WHERE id_befizetescel IS NULL)
          + (SELECT count(*) FROM ervenyes_kiadas WHERE id_kiadascel IS NULL))::text,
         '0',
         ((SELECT count(*) FROM ervenyes_befizetes WHERE id_befizetescel IS NULL)
          + (SELECT count(*) FROM ervenyes_kiadas WHERE id_kiadascel IS NULL)) = 0

  -- ── [7.6] Román jogcímnév hiánya a HASZNÁLT jogcímeken ───────────────────
  UNION ALL SELECT '[7.6]',
         'Használt jogcím valódi román név nélkül (a regiszterbe magyar kerül)',
         (SELECT count(*)::text FROM public.szamadasicel sc
           WHERE COALESCE(NULLIF(BTRIM(sc.nevro), ''), sc.nev) = sc.nev
             AND (sc.id IN (SELECT kc.id_szamadasicel FROM ervenyes_kiadas ek
                              JOIN public.kiadascel kc ON kc.id = ek.id_kiadascel)
               OR sc.id IN (SELECT bc.id_szamadasicel FROM ervenyes_befizetes eb
                              JOIN public.befizetescel bc ON bc.id = eb.id_befizetescel))),
         '0',
         (SELECT count(*) FROM public.szamadasicel sc
           WHERE COALESCE(NULLIF(BTRIM(sc.nevro), ''), sc.nev) = sc.nev
             AND (sc.id IN (SELECT kc.id_szamadasicel FROM ervenyes_kiadas ek
                              JOIN public.kiadascel kc ON kc.id = ek.id_kiadascel)
               OR sc.id IN (SELECT bc.id_szamadasicel FROM ervenyes_befizetes eb
                              JOIN public.befizetescel bc ON bc.id = eb.id_befizetescel))) = 0

  -- ── [2.x] Készpénz-korlátok (Változások 2026) ────────────────────────────
  UNION ALL SELECT '[2.a]',
         '5 000 lej FELETTI egyedi készpénzes kifizetés 2026-ban',
         (SELECT count(*)::text FROM ervenyes_kiadas
           WHERE bankszamla_id IS NULL AND osszeg_ron > 5000),
         '0',
         (SELECT count(*) FROM ervenyes_kiadas
           WHERE bankszamla_id IS NULL AND osszeg_ron > 5000) = 0

  UNION ALL SELECT '[2.b]',
         'Feldarabolás-gyanú: partner+nap készpénzben > 5 000 lej, több tételből',
         (SELECT count(*)::text FROM (
            SELECT congregation_id, datum, LOWER(BTRIM(atvevo)) AS p
              FROM ervenyes_kiadas
             WHERE bankszamla_id IS NULL AND COALESCE(BTRIM(atvevo), '') <> ''
             GROUP BY congregation_id, datum, LOWER(BTRIM(atvevo))
            HAVING count(*) >= 2 AND sum(osszeg_ron) > 5000) x),
         '0',
         (SELECT count(*) FROM (
            SELECT congregation_id, datum, LOWER(BTRIM(atvevo)) AS p
              FROM ervenyes_kiadas
             WHERE bankszamla_id IS NULL AND COALESCE(BTRIM(atvevo), '') <> ''
             GROUP BY congregation_id, datum, LOWER(BTRIM(atvevo))
            HAVING count(*) >= 2 AND sum(osszeg_ron) > 5000) x) = 0

  UNION ALL SELECT '[2.c]',
         'Nap, ahol a készpénzes kifizetések összege > 10 000 lej (gyülekezetenként)',
         (SELECT count(*)::text FROM (
            SELECT congregation_id, datum FROM ervenyes_kiadas
             WHERE bankszamla_id IS NULL
             GROUP BY congregation_id, datum
            HAVING sum(osszeg_ron) > 10000) x),
         '0',
         (SELECT count(*) FROM (
            SELECT congregation_id, datum FROM ervenyes_kiadas
             WHERE bankszamla_id IS NULL
             GROUP BY congregation_id, datum
            HAVING sum(osszeg_ron) > 10000) x) = 0

  UNION ALL SELECT '[2.d]',
         '1 000 lej feletti készpénzes elszámolási előleg (207.02) 2026-ban',
         (SELECT count(*)::text FROM ervenyes_kiadas ek
            JOIN public.kiadascel    kc ON kc.id = ek.id_kiadascel
            JOIN public.szamadasicel sc ON sc.id = kc.id_szamadasicel
           WHERE sc.id = '207.02' AND ek.bankszamla_id IS NULL AND ek.osszeg_ron > 1000),
         '0',
         (SELECT count(*) FROM ervenyes_kiadas ek
            JOIN public.kiadascel    kc ON kc.id = ek.id_kiadascel
            JOIN public.szamadasicel sc ON sc.id = kc.id_szamadasicel
           WHERE sc.id = '207.02' AND ek.bankszamla_id IS NULL AND ek.osszeg_ron > 1000) = 0

  -- ── [7.1]-[7.3] Lapozás-terhelés (tájékoztató) ───────────────────────────
  UNION ALL SELECT '[7.1]',
         'Nap+forrás, ahol 20-nál több kiadás van (kísérőív 2+ lap)',
         (SELECT count(*)::text FROM (
            SELECT congregation_id, datum, COALESCE(bankszamla_id::text, 'K') AS f
              FROM ervenyes_kiadas
             GROUP BY congregation_id, datum, COALESCE(bankszamla_id::text, 'K')
            HAVING count(*) > 20) x),
         '(tájékoztató)',
         true

  UNION ALL SELECT '[7.2]',
         'Hónap+forrás, ahol 40-nél több naplósor van (Registru 2+ lap)',
         (SELECT count(*)::text FROM (
            SELECT congregation_id, date_trunc('month', datum) AS ho,
                   COALESCE(bankszamla_id::text, 'K') AS f
              FROM (SELECT congregation_id, datum, bankszamla_id FROM ervenyes_kiadas
                    UNION ALL
                    SELECT congregation_id, datum, bankszamla_id FROM ervenyes_befizetes) m
             GROUP BY congregation_id, date_trunc('month', datum), COALESCE(bankszamla_id::text, 'K')
            HAVING count(*) > 40) x),
         '(tájékoztató)',
         true

  -- ── [9.2] Rögzített nyitó egyenlegek 2026-ra ─────────────────────────────
  UNION ALL SELECT '[9.2]',
         'Aktív gyülekezet 2026-os RÖGZÍTETT készpénz-nyitó NÉLKÜL',
         (SELECT count(*)::text FROM public.congregations c
           WHERE c.status = 'active'
             AND NOT EXISTS (SELECT 1 FROM public.keszpenz_nyito_egyenleg n
                              WHERE n.congregation_id = c.id AND n.eve = 2026)),
         '(tájékoztató — ezeknél a Főkönyv nyitója levezetett becslés)',
         true

  -- ── [9.5] Visszadátumozott rögzítések ────────────────────────────────────
  UNION ALL SELECT '[9.5]',
         'Visszadátumozott tétel (későbbi rögzítés korábbi dátummal) 2026-ban',
         (SELECT count(*)::text FROM (
            SELECT t.id,
                   max(t.datum) OVER (PARTITION BY t.congregation_id
                                      ORDER BY t.sorrend
                                      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS elozo_max,
                   t.datum
              FROM (SELECT congregation_id, id, datum, id AS sorrend FROM public.kiadas
                     WHERE deleted = false AND COALESCE(stornozott,false) = false
                       AND datum::date >= DATE '2026-01-01' AND datum::date < DATE '2027-01-01') t) j
           WHERE j.elozo_max IS NOT NULL AND j.datum < j.elozo_max),
         '(tájékoztató — ennyi sor csúsztatja a Főkönyv sorszámait újranyomtatáskor)',
         true

  -- ── [9.6] Csak-stornós hónapok (üres Főkönyv-lap veszélye) ───────────────
  UNION ALL SELECT '[9.6]',
         'Hónap, ahol MINDEN tétel stornózott (üres Főkönyv-lap generálódna)',
         (SELECT count(*)::text FROM (
            SELECT k.congregation_id, date_trunc('month', k.datum::date) AS ho
              FROM public.kiadas k
             WHERE k.deleted = false
               AND k.datum::date >= DATE '2026-01-01' AND k.datum::date < DATE '2027-01-01'
             GROUP BY k.congregation_id, date_trunc('month', k.datum::date)
            HAVING count(*) FILTER (WHERE NOT COALESCE(k.stornozott, false)) = 0) x),
         '0',
         (SELECT count(*) FROM (
            SELECT k.congregation_id, date_trunc('month', k.datum::date) AS ho
              FROM public.kiadas k
             WHERE k.deleted = false
               AND k.datum::date >= DATE '2026-01-01' AND k.datum::date < DATE '2027-01-01'
             GROUP BY k.congregation_id, date_trunc('month', k.datum::date)
            HAVING count(*) FILTER (WHERE NOT COALESCE(k.stornozott, false)) = 0) x) = 0

  -- ── [Leltár] a korábbi néma csonkolás súlyossága + kivezetési adatok ─────
  UNION ALL SELECT '[leltar.1]',
         'Gyülekezet 900+ élő leltári tétellel (a v0.9.166 előtti csonkolás érintettjei)',
         (SELECT count(*)::text FROM (
            SELECT congregation_id FROM public.leltar_tetelek
             WHERE COALESCE(is_deleted, false) = false
             GROUP BY congregation_id HAVING count(*) > 900) x),
         '(tájékoztató)',
         true

  UNION ALL SELECT '[leltar.2]',
         'Kivezetett leltári tétel kivezetési dátum NÉLKÜL',
         (SELECT count(*)::text FROM public.leltar_tetelek
           WHERE COALESCE(is_deleted, false) = true AND torles_datuma IS NULL),
         '0',
         (SELECT count(*) FROM public.leltar_tetelek
           WHERE COALESCE(is_deleted, false) = true AND torles_datuma IS NULL) = 0

  -- ── [Munkanapló] az offline tükörből hiányzó oszlopok léte ───────────────
  UNION ALL SELECT '[munkanaplo]',
         'A napszak / uv_templomban / uv_betegnel oszlop létezik a munkanaplo táblán',
         (SELECT count(*)::text FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'munkanaplo'
             AND column_name IN ('napszak', 'uv_templomban', 'uv_betegnel')),
         '3',
         (SELECT count(*) FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'munkanaplo'
             AND column_name IN ('napszak', 'uv_templomban', 'uv_betegnel')) = 3

) t
ORDER BY blokk;
