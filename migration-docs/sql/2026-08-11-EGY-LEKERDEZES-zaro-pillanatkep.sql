-- KARTOTÉKA — EGYETLEN lekérdezés: MI TÖRTÉNT a záró-pillanatkép fájl
--              teljes lefuttatásakor? (2026-08-11)
--
-- ════════════════════════════════════════════════════════════════════════════
-- HELYZET
-- ════════════════════════════════════════════════════════════════════════════
-- A 2026-08-11-zaro-pillanatkep-egyesites.sql EGÉSZBEN lett lefuttatva. A futás
-- a 3. SZAKASZ (⛔ VISSZAÁLLÍTÁS) token-kapujánál HANGOS HIBÁVAL megállt:
--
--     „⛔ VISSZAÁLLÍTÁS-KAPU: ez a szakasz visszacsinálja az 1. SZAKASZT…"
--
-- ✅ EZ NEM BAJ — EZ MAGA A VÉDELEM, AHOGY TERVEZTÜK.
--    A 3. SZAKASZ szándékosan ÉLES (nincs kikommentelve), ezért TOKENHEZ van
--    kötve. A kapu így néz ki (a fájl 497–503. sora):
--
--        BEGIN;
--        DO $$ BEGIN
--          IF coalesce(current_setting('kartoteka.zaro_visszaallitas', true), '') <> 'IGEN'
--          THEN RAISE EXCEPTION '⛔ VISSZAÁLLÍTÁS-KAPU: …'; END IF;
--        END $$;
--        UPDATE public.bealitas … SET szamadas_zaro_adatok = m.regi_ertek …
--        COMMIT;
--
--    A `RAISE EXCEPTION` a 3. SZAKASZ SAJÁT tranzakcióján belül szállt el, tehát
--    az az egy tranzakció ABORTÁLT ÁLLAPOTBA került. Abortált tranzakcióban a
--    Postgres MINDEN további utasítást elutasít („current transaction is
--    aborted"), így az utána következő `UPDATE` EL SEM INDULT, a záró `COMMIT`
--    pedig ROLLBACK-ként hajtódott végre.
--    ⇒ A VISSZAÁLLÍTÁS NEM FUTOTT LE. Semmi nem lett visszacsinálva.
--
--    (Ez a MÁSODIK alkalom, hogy egy élő visszaállító szakasz elsült volna a
--     teljes fájl lefuttatásától. Az elsőnél — 2026-08-11-globalis-hozzaferes-
--     szukites.sql — vezettük be ezt a token-kaput. Most bizonyította magát:
--     UGYANAZ a felhasználói szokás, MÁS kimenetel.)
--
-- ✅ AZ 1. SZAKASZ VISZONT LEFUTOTT: a `bealitas_zaro_adatok_mentes_20260811`
--    tábla létrejött, és megjelenik a mentés-leltárban.
--
-- EZ A LEKÉRDEZÉS CSAK OLVAS. Egyetlen SELECT — az eredménye nem nyelhető el.
--
-- HOGYAN OLVASD: `ertek` vs `vart`. „✅" = rendben. Bármelyik „❌" → küldd vissza.
-- A 40-es sortól TÁJÉKOZTATÓ sorok jönnek (mindig ✅, csak kiírnak egy értéket).
--
-- ⚠️ HA EZT A HIBÁT KAPOD: „relation »public.bealitas_zaro_adatok_mentes_20260811«
--    does not exist" — akkor az 1. SZAKASZ MÉGSEM futott le. Ez esetben ne
--    ijedj meg: az sem adatvesztés, csak a migráció maradt el. Küldd vissza.
-- ════════════════════════════════════════════════════════════════════════════

WITH
-- Minden tárolt záró-adat, a két alak megkülönböztetésével.
zaro AS (
  SELECT
    b.id,
    b.congregation_id,
    COALESCE(b.accounting_finalized, false)                            AS lezart,
    b.szamadas_zaro_adatok                                             AS blob,
    -- RÉGI (1-es) alak jele: van felső szintű `kanonikus` alobjektum.
    (jsonb_typeof(b.szamadas_zaro_adatok -> 'kanonikus') = 'object')   AS regi_alak,
    -- ÚJ (2-es) alak jele: alakVerzio >= 2.
    (jsonb_typeof(b.szamadas_zaro_adatok -> 'alakVerzio') = 'number'
       AND (b.szamadas_zaro_adatok ->> 'alakVerzio')::numeric >= 2)    AS uj_alak,
    CASE WHEN jsonb_typeof(b.szamadas_zaro_adatok -> 'totalIncome') = 'number'
         THEN (b.szamadas_zaro_adatok ->> 'totalIncome')::numeric END  AS tarolt_bev,
    CASE WHEN jsonb_typeof(b.szamadas_zaro_adatok -> 'totalExpense') = 'number'
         THEN (b.szamadas_zaro_adatok ->> 'totalExpense')::numeric END AS tarolt_kia,
    CASE WHEN jsonb_typeof(b.szamadas_zaro_adatok -> 'szerverEllenorzes' -> 'ivenKivuliBevetel') = 'number'
         THEN (b.szamadas_zaro_adatok -> 'szerverEllenorzes' ->> 'ivenKivuliBevetel')::numeric END AS iven_kivul_bev,
    CASE WHEN jsonb_typeof(b.szamadas_zaro_adatok -> 'szerverEllenorzes' -> 'ivenKivuliKiadas') = 'number'
         THEN (b.szamadas_zaro_adatok -> 'szerverEllenorzes' ->> 'ivenKivuliKiadas')::numeric END  AS iven_kivul_kia
  FROM public.bealitas b
  WHERE jsonb_typeof(b.szamadas_zaro_adatok) = 'object'
    AND b.szamadas_zaro_adatok <> '{}'::jsonb
),
-- A mentés-tábla és az ÉLŐ sor párba állítva. EZ A DÖNTŐ BIZONYÍTÉK-FORRÁS:
-- ha a 3. SZAKASZ lefutott volna, minden párnál `elo = regi` állna.
par AS (
  SELECT
    m.id,
    m.congregation_id,
    m.regi_ertek                                            AS regi,
    b.szamadas_zaro_adatok                                  AS elo,
    (b.szamadas_zaro_adatok = m.regi_ertek)                 AS visszaallt,
    (jsonb_typeof(b.szamadas_zaro_adatok -> 'kanonikus') = 'object')  AS elo_regi_alaku,
    (b.szamadas_zaro_adatok -> 'szerverEllenorzes' ->> 'forras'
       = 'migracio-2026-08-11-zaro-pillanatkep-egyesites')  AS migracio_kezenyoma
  FROM public.bealitas_zaro_adatok_mentes_20260811 m
  JOIN public.bealitas b
    ON b.id = m.id AND b.congregation_id = m.congregation_id
),
-- Az egyházmegyének BEKÜLDÖTT irat végösszege (a lényegi kereszt-próbához).
bekuldott AS (
  SELECT
    ds.congregation_id,
    ds.year,
    max(CASE WHEN jsonb_typeof(ds.snapshot_data -> 'totalIncome') = 'number'
             THEN (ds.snapshot_data ->> 'totalIncome')::numeric
             WHEN jsonb_typeof(ds.snapshot_data -> 'totalActualIncome') = 'number'
             THEN (ds.snapshot_data ->> 'totalActualIncome')::numeric END)  AS bek_bev,
    max(CASE WHEN jsonb_typeof(ds.snapshot_data -> 'totalExpense') = 'number'
             THEN (ds.snapshot_data ->> 'totalExpense')::numeric
             WHEN jsonb_typeof(ds.snapshot_data -> 'totalActualExpense') = 'number'
             THEN (ds.snapshot_data ->> 'totalActualExpense')::numeric END) AS bek_kia
  FROM public.document_submissions ds
  WHERE ds.document_type = 'szamadas'
    AND ds.status <> 'returned'
  GROUP BY ds.congregation_id, ds.year
)

SELECT x.sorrend, x.mit_mer, x.ertek, x.vart,
       CASE WHEN x.ertek = x.vart THEN '✅' ELSE '❌' END AS rendben
FROM (

  -- ══ A) LEFUTOTT-E AZ 1. SZAKASZ? (mentés + migráció) ═════════════════════

  SELECT 1 AS sorrend,
         'A1. A mentes-tabla letezik (1/A lepes lefutott)'::text AS mit_mer,
         (to_regclass('public.bealitas_zaro_adatok_mentes_20260811') IS NOT NULL)::text AS ertek,
         'true'::text AS vart

  UNION ALL SELECT 2, 'A2. RLS bekapcsolva a mentes-tablan (penzugyi pillanatkepek)',
         COALESCE((SELECT c.relrowsecurity::text FROM pg_class c
                     JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname='public'
                      AND c.relname='bealitas_zaro_adatok_mentes_20260811'), 'nincs tabla'),
         'true'

  UNION ALL SELECT 3, 'A3. Az anon/authenticated EGYETLEN jogot sem kapott a mentes-tablan (0)',
         (SELECT count(*)::text
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, '{}'::aclitem[])) a
            LEFT JOIN pg_roles ro ON ro.oid = a.grantee
           WHERE n.nspname='public'
             AND c.relname='bealitas_zaro_adatok_mentes_20260811'
             AND (a.grantee = 0 OR ro.rolname IN ('anon','authenticated'))), '0'

  -- ⚠️ EZ A LEGFONTOSABB SOR AZ 1. SZAKASZRA. Ha nem 0, a migracio felig allt le.
  UNION ALL SELECT 4, '⚠️ A4. Maradt-e REGI (1-es) alaku zaro-adat? (0 kell)',
         (SELECT count(*)::text FROM zaro WHERE regi_alak AND NOT uj_alak), '0'

  UNION ALL SELECT 5, 'A5. MINDEN mentett sor parja megvan az elo bealitas-ban',
         (SELECT (count(*) = (SELECT count(*) FROM public.bealitas_zaro_adatok_mentes_20260811))::text
            FROM par), 'true'

  UNION ALL SELECT 6, 'A6. MINDEN mentett sor at is allt az UJ (2-es) alakra',
         (SELECT COALESCE(bool_and(NOT elo_regi_alaku), true)::text FROM par), 'true'

  -- ══ B) NEM FUTOTT-E LE A 3. SZAKASZ? (⛔ VISSZAÁLLÍTÁS) ══════════════════
  -- Ha lefutott volna, MINDEN parnal `elo = regi` allna, a `kanonikus` visszakerult
  -- volna a felso szintre, es a `szerverEllenorzes` kezenyoma eltunt volna.

  UNION ALL SELECT 11, '⛔ B1. VISSZAALLT sorok szama (elo ertek = a mentett regi ertek) — 0 kell',
         (SELECT count(*)::text FROM par WHERE visszaallt), '0'

  UNION ALL SELECT 12, '⛔ B2. Elo sor, amin ujra ott a felso szintu `kanonikus` — 0 kell',
         (SELECT count(*)::text FROM par WHERE elo_regi_alaku), '0'

  -- A belso COALESCE azert kell, mert hianyzo `szerverEllenorzes` eseten a
  -- kifejezes NULL — a bool_and pedig a NULL bemenetet KIHAGYNA, vagyis a hiany
  -- nemán „igaz"-za valna. Itt a NULL = HAMIS (fail-closed).
  UNION ALL SELECT 13, '⛔ B3. A MIGRACIO KEZENYOMA MINDEN mentett sornal ott van',
         (SELECT COALESCE(bool_and(COALESCE(migracio_kezenyoma, false)), true)::text
            FROM par), 'true'

  -- Osszefoglalo egy sorban — ezt idezd, ha visszakuldod az eredmenyt.
  UNION ALL SELECT 14, '⛔ B4. VERDIKT: a 3. SZAKASZ (visszaallitas) NEM futott le',
         (SELECT CASE
                   WHEN count(*) = 0 THEN 'nem futott (nincs mentett sor — vacuum igaz)'
                   WHEN bool_and(NOT visszaallt AND NOT elo_regi_alaku
                                 AND COALESCE(migracio_kezenyoma, false))
                        THEN 'nem futott (bizonyitva)'
                   ELSE 'GYANUS — LEFUTHATOTT, kuldd vissza!'
                 END
            FROM par),
         (SELECT CASE
                   WHEN count(*) = 0 THEN 'nem futott (nincs mentett sor — vacuum igaz)'
                   ELSE 'nem futott (bizonyitva)'
                 END
            FROM par)

  -- A token-kapu maga. Uj munkamenetben MINDIG NULL — es epp ez a lenyeg:
  -- a visszaallitas csak ott indulhat, ahol valaki KEZZEL beallitotta.
  UNION ALL SELECT 15, 'B5. A visszaallitas-token EBBEN a munkamenetben nincs beallitva',
         (COALESCE(current_setting('kartoteka.zaro_visszaallitas', true), '') <> 'IGEN')::text,
         'true'

  -- ══ C) A LÉNYEGI PRÓBA — egyezik-e a tárolt szám a BEKÜLDÖTT irattal ═════

  UNION ALL SELECT 21, '⚠️ C1. Elter-e a tarolt zaro-adat a BEKULDOTT Szamadastol? (0 kell)',
         (SELECT count(*)::text
            FROM zaro z
            JOIN bekuldott k
              ON k.congregation_id = z.congregation_id
             AND z.id ~ '^[0-9]{4}$'
             AND k.year = z.id::int
           WHERE z.uj_alak
             AND (COALESCE(z.tarolt_bev, 0) IS DISTINCT FROM COALESCE(k.bek_bev, 0)
               OR COALESCE(z.tarolt_kia, 0) IS DISTINCT FROM COALESCE(k.bek_kia, 0))), '0'

  UNION ALL SELECT 22, 'C2. OS-alak: kanonikus pillanatkep NELKUL lezart ev (SQL-bol nem javithato)',
         (SELECT count(*)::text FROM zaro
           WHERE lezart AND NOT regi_alak AND NOT uj_alak
             AND NOT (blob ? 'totalActualIncome')),
         (SELECT count(*)::text FROM zaro
           WHERE lezart AND NOT regi_alak AND NOT uj_alak
             AND NOT (blob ? 'totalActualIncome'))

  -- ══ D) TÁJÉKOZTATÓ SOROK (nincs „helyes" érték — mindig ✅) ══════════════

  UNION ALL SELECT 41, 'D1. Mentes-tabla sorai (ennyi eredeti erteket orzunk)',
         (SELECT count(*)::text FROM public.bealitas_zaro_adatok_mentes_20260811),
         (SELECT count(*)::text FROM public.bealitas_zaro_adatok_mentes_20260811)

  UNION ALL SELECT 42, 'D2. UJ (2-es) alaku zaro-adatok szama',
         (SELECT count(*)::text FROM zaro WHERE uj_alak),
         (SELECT count(*)::text FROM zaro WHERE uj_alak)

  UNION ALL SELECT 43, 'D3. Tarolt zaro-adattal rendelkezo gyulekezet-evek osszesen',
         (SELECT count(*)::text FROM zaro),
         (SELECT count(*)::text FROM zaro)

  UNION ALL SELECT 44, 'D4. Mikor keszult a mentes (elso / utolso sor)',
         COALESCE((SELECT min(mentve_ekkor)::text || '  …  ' || max(mentve_ekkor)::text
                     FROM public.bealitas_zaro_adatok_mentes_20260811), '— nincs sor —'),
         COALESCE((SELECT min(mentve_ekkor)::text || '  …  ' || max(mentve_ekkor)::text
                     FROM public.bealitas_zaro_adatok_mentes_20260811), '— nincs sor —')

  UNION ALL SELECT 45, 'D5. Hivatalos iven KIVULRE konyvelt penz a lezart eveknel (RON)',
         COALESCE((SELECT string_agg(
                     congregation_id::text || '/' || id ||
                     ' — bevetel ' || to_char(COALESCE(iven_kivul_bev, 0), 'FM999G999G999D00') ||
                     ', kiadas '   || to_char(COALESCE(iven_kivul_kia, 0), 'FM999G999G999D00'),
                     ' | ' ORDER BY congregation_id, id)
                   FROM zaro
                  WHERE COALESCE(iven_kivul_bev, 0) <> 0
                     OR COALESCE(iven_kivul_kia, 0) <> 0), '—'),
         COALESCE((SELECT string_agg(
                     congregation_id::text || '/' || id ||
                     ' — bevetel ' || to_char(COALESCE(iven_kivul_bev, 0), 'FM999G999G999D00') ||
                     ', kiadas '   || to_char(COALESCE(iven_kivul_kia, 0), 'FM999G999G999D00'),
                     ' | ' ORDER BY congregation_id, id)
                   FROM zaro
                  WHERE COALESCE(iven_kivul_bev, 0) <> 0
                     OR COALESCE(iven_kivul_kia, 0) <> 0), '—')

) x
ORDER BY x.sorrend;

-- ════════════════════════════════════════════════════════════════════════════
-- MIT JELENT AZ EREDMÉNY
-- ════════════════════════════════════════════════════════════════════════════
--
-- A1–A6 ✅ ÉS B1–B5 ✅  → MINDEN RENDBEN.
--        Az 1. SZAKASZ végigfutott és COMMIT-elt, a 3. SZAKASZ token-kapuja
--        HELYESEN megállította a visszaállítást. SEMMI NEM LETT VISSZACSINÁLVA.
--        Nincs teendő az adatbázisban; a hibaüzenet, amit láttál, a védelem
--        hangja volt, nem hibáé.
--
-- A4 ❌ (nem 0)  → maradt RÉGI alakú sor: az 1. SZAKASZ nem futott végig.
--        TEENDŐ: jelöld ki a 2026-08-11-zaro-pillanatkep-egyesites.sql
--        1. SZAKASZÁT (a BEGIN-től a COMMIT-ig) és futtasd újra. Idempotens.
--
-- B1 vagy B2 ❌ (nem 0)  → ⛔ SÜRGŐS: a visszaállítás MÉGIS lefutott valahol.
--        A tárolt záró-adat visszakerült a NYERS alakra. Ez NEM adatvesztés
--        (a felület a `kanonikus` alobjektumot részesíti előnyben, tehát jó
--        számot mutat), de a hivatalos blob megint kettős igazságot hordoz.
--        TEENDŐ: futtasd újra az 1. SZAKASZT — a mentés-tábla `ON CONFLICT DO
--        NOTHING`-gal védett, tehát az EREDETI érték nem íródik felül.
--
-- B3 ❌  → van olyan mentett sor, amiről hiányzik a migráció kézenyoma
--        (`szerverEllenorzes.forras`). Vegyes állapot — küldd vissza.
--
-- C1 ❌ (nem 0)  → NEM ennek a futásnak a hibája: ezeknél a gyülekezet-éveknél
--        a beküldött irat egy KORÁBBI zárásból való (feloldás után újra
--        véglegesítettek, de nem küldték be újra). A lelkészi jelentés és a
--        Pénzügy fül egymással ettől függetlenül EGYEZIK.
--
-- C2 > 0  → ennyi lezárt évhez SOSEM készült kanonikus pillanatkép (2026-07-10
--        előtti zárás vagy desktopról indított zárás). Ezeket SQL nem tudja
--        javítani: ha pontos szám kell, az évet fel kell oldatni és újra
--        véglegesíteni.
--
-- D5 nem „—"  → NEM hiba, hanem átnézésre hívó jel: ennyi pénz ül olyan kódon,
--        ami nincs rajta a hivatalos Számadás-íven. Érdemes a gyülekezettel
--        átnézni a besorolást.
--
-- ⚠️ A `bealitas_zaro_adatok_mentes_20260811` táblát NE dobd el, amíg legalább
--    egy teljes évet végig nem ellenőriztél a felületen (Lelkészi jelentés
--    VII.6/VII.7 + Számadás). Az az egyetlen visszaút.
--    A mentés-leltárban ez a tábla BESOROLATLAN, és ez helyes: átmeneti
--    visszaállító tábla, aminek NEM szabad bekerülnie a gyülekezeti mentésbe.
