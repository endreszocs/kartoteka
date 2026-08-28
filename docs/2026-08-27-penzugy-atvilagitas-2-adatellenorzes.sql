-- ============================================================================
--  KARTOTÉKA — PÉNZÜGY ÁTVILÁGÍTÁS · 2. KÖR: ADAT-ELLENŐRZÉS
--  2026-08-27
--
--  Ez a fájl KIZÁRÓLAG az 1. kör (séma-térkép) által ÉLESBEN MEGERŐSÍTETT
--  oszlopneveket használja. Ahol egy tábla oszlopait még nem ismerjük
--  (bealitas, keszpenz_nyito_egyenleg, bankszamla_nyito_egyenleg, belsomozgas,
--  import_logs, szamadasicel, befizetescel, kiadascel), ott NEM tippelünk:
--  a sorokat to_jsonb()-vel, kulcs-érték párokra bontva olvassuk ki.
--
--  TELJESEN READ-ONLY. Egyetlen utasítás (UNION ALL), mert a Supabase editor
--  csak az UTOLSÓ rácsot mutatja.
--
--  A LEGFONTOSABB KÉRDÉS ITT AZ 1. SZAKASZ: a banki tételekre érvényes-e az
--  egyediségi index. Ettől függ, szabad-e egyáltalán újrafuttatni az importot.
-- ============================================================================

SELECT * FROM (

-- ── 1. SZAKASZ: TELJES, CSONKÍTATLAN INDEX-DEFINÍCIÓK ─────────────────────
--    Az 1. körben a WHERE-feltétel 200 karakternél levágódott. Ez dönti el,
--    hogy egy ismételt banki import duplikálna-e.
SELECT 10 AS sorrend,
       '1. TELJES INDEX-DEFINÍCIÓ'::text AS szakasz,
       c.relname::text AS targy,
       (CASE WHEN i.indisunique THEN 'EGYEDI' ELSE 'sima' END)::text AS eredmeny,
       pg_get_indexdef(i.indexrelid)::text AS reszletek
  FROM pg_index i
  JOIN pg_class c   ON c.oid  = i.indexrelid
  JOIN pg_class tc  ON tc.oid = i.indrelid
 WHERE tc.relnamespace = 'public'::regnamespace
   AND tc.relname IN ('kiadas','befizetes')
   AND i.indisunique

UNION ALL
-- ── 2. SZAKASZ: a másodlagos táblák OSZLOPAI (hogy ne kelljen tippelni) ────
SELECT 20,
       '2. MÁSODLAGOS TÁBLÁK OSZLOPAI',
       (col.table_name::text || '.' || col.column_name::text)::text,
       col.data_type::text,
       (CASE WHEN col.is_nullable::text = 'NO' THEN 'NOT NULL' ELSE 'nullable' END)::text
  FROM information_schema.columns col
 WHERE col.table_schema = 'public'
   AND col.table_name IN ('bankszamla_nyito_egyenleg','keszpenz_nyito_egyenleg',
                          'belsomozgas','import_logs','szamadasicel',
                          'befizetescel','kiadascel','bankszamlak')

UNION ALL
-- ── 3. SZAKASZ: HOL VAN VALÓJÁBAN ADAT a négy nyitó-egyenleg tárolóban? ────
--    to_jsonb + jsonb_each: egyetlen oszlopnevet sem kell ismernünk hozzá.
SELECT 30,
       '3a. keszpenz_nyito_egyenleg TARTALMA',
       (t.ctid::text || ' · ' || j.key)::text,
       left(j.value::text, 80)::text,
       ''::text
  FROM public.keszpenz_nyito_egyenleg t
  CROSS JOIN LATERAL jsonb_each(to_jsonb(t)) j

UNION ALL
SELECT 31,
       '3b. bankszamla_nyito_egyenleg TARTALMA',
       (t.ctid::text || ' · ' || j.key)::text,
       left(j.value::text, 80)::text,
       ''::text
  FROM public.bankszamla_nyito_egyenleg t
  CROSS JOIN LATERAL jsonb_each(to_jsonb(t)) j

UNION ALL
SELECT 32,
       '3c. bealitas — CSAK a nyitó/véglegesítés kulcsok',
       (t.ctid::text || ' · ' || j.key)::text,
       left(j.value::text, 80)::text,
       ''::text
  FROM public.bealitas t
  CROSS JOIN LATERAL jsonb_each(to_jsonb(t)) j
 WHERE j.key ~* 'nyito|finalized|congregation|ev$|year'

UNION ALL
SELECT 33,
       '3d. bankszamlak — nyitó egyenleg oszlop',
       ('bankszamla #' || b.id::text || ' · ' || COALESCE(b.valuta::text, '?'))::text,
       COALESCE(b.nyito_egyenleg::text, 'NULL')::text,
       COALESCE(b.congregation_id::text, 'nincs congregation_id')::text
  FROM public.bankszamlak b

UNION ALL
-- ── 3e. SOR-DARABSZÁMOK a nyitó tárolókhoz ────────────────────────────────
--     Enélkül nem lehetne megkülönböztetni az ÜRES táblát attól, hogy a
--     fenti LATERAL-os szakasz miért nem adott sort. (Az üres eredmény
--     önmagában nem bizonyíték — ez nálunk már megégett hibaosztály.)
SELECT 34,
       '3e. NYITÓ TÁROLÓK SORSZÁMA',
       n.tabla::text,
       n.db::text,
       'ha 0, a tábla létezik, de ÜRES'::text
  FROM (
        SELECT 'keszpenz_nyito_egyenleg'::text  AS tabla, count(*) AS db FROM public.keszpenz_nyito_egyenleg
        UNION ALL
        SELECT 'bankszamla_nyito_egyenleg'::text, count(*) FROM public.bankszamla_nyito_egyenleg
        UNION ALL
        SELECT 'bealitas'::text,                  count(*) FROM public.bealitas
        UNION ALL
        SELECT 'bankszamlak'::text,               count(*) FROM public.bankszamlak
       ) n

UNION ALL
-- ── 4. SZAKASZ: az irattipus TÉNYLEGES értékkészlete ──────────────────────
--    Nincs rá CHECK megszorítás, tehát ez konvenció — az egyediségi index
--    viszont szövegre illeszt ('%észpénz%'), ezért ez kritikus.
SELECT 40,
       '4a. kiadas.irattipus ELŐFORDULÁSOK',
       COALESCE(k.irattipus, '(NULL)')::text,
       count(*)::text,
       ('ebből törölt: ' || (count(*) FILTER (WHERE k.deleted))::text
        || ' · stornó: '  || (count(*) FILTER (WHERE k.stornozott))::text
        || ' · bankszámlához kötve: ' || (count(*) FILTER (WHERE k.bankszamla_id IS NOT NULL))::text)::text
  FROM public.kiadas k
 GROUP BY k.irattipus

UNION ALL
SELECT 41,
       '4b. befizetes.irattipus ELŐFORDULÁSOK',
       COALESCE(b.irattipus, '(NULL)')::text,
       count(*)::text,
       ('ebből törölt: ' || (count(*) FILTER (WHERE b.deleted))::text
        || ' · stornó: '  || (count(*) FILTER (WHERE b.stornozott))::text
        || ' · bankszámlához kötve: ' || (count(*) FILTER (WHERE b.bankszamla_id IS NOT NULL))::text)::text
  FROM public.befizetes b
 GROUP BY b.irattipus

UNION ALL
-- ── 5. SZAKASZ: ÁRVA BELSŐ MOZGÁS — pár nélkül maradt átvezetés ───────────
--    Egy belső mozgásnak PONTOSAN 2 sora kell legyen (1 bevétel + 1 kiadás).
--    Ami nem 2, az adathiba: felfújja vagy elrontja az egyenleget.
SELECT 50,
       '5. ÁRVA BELSŐ MOZGÁS (pár nélküli)',
       bm.k::text,
       (bm.db::text || ' sor · ' || bm.oldalak)::text,
       ('congregation: ' || COALESCE(bm.cong, 'NULL')
        || ' · dátum: ' || COALESCE(bm.datumok, '?')
        || ' · összeg: ' || COALESCE(bm.osszegek, '?'))::text
  FROM (
        SELECT x.belso_mozgas_xkey AS k,
               string_agg(DISTINCT x.congregation_id::text, ',') AS cong,
               count(*) AS db,
               string_agg(DISTINCT x.oldal, '+' ORDER BY x.oldal) AS oldalak,
               string_agg(DISTINCT x.d::text, ', ') AS datumok,
               string_agg(DISTINCT x.osszeg::text, ', ') AS osszegek
          FROM (
                SELECT belso_mozgas_xkey, congregation_id, 'bevetel'::text AS oldal,
                       datum::date AS d, osszeg
                  FROM public.befizetes
                 WHERE belso_mozgas_xkey IS NOT NULL AND deleted = false
                UNION ALL
                SELECT belso_mozgas_xkey, congregation_id, 'kiadas'::text,
                       datum::date, osszeg
                  FROM public.kiadas
                 WHERE belso_mozgas_xkey IS NOT NULL AND deleted = false
               ) x
         GROUP BY x.belso_mozgas_xkey
        HAVING count(*) <> 2
       ) bm

UNION ALL
-- ── 6. SZAKASZ: BELSŐ MOZGÁS ÖSSZESÍTŐ (mennyi van, párosan-e) ────────────
SELECT 60,
       '6. BELSŐ MOZGÁS ÖSSZESÍTŐ',
       'összes belso_mozgas_xkey csoport'::text,
       count(*)::text,
       ('ebből szabályos (2 sor): ' || (count(*) FILTER (WHERE db = 2))::text
        || ' · HIBÁS: ' || (count(*) FILTER (WHERE db <> 2))::text)::text
  FROM (
        SELECT belso_mozgas_xkey AS k, count(*) AS db
          FROM (
                SELECT belso_mozgas_xkey FROM public.befizetes
                 WHERE belso_mozgas_xkey IS NOT NULL AND deleted = false
                UNION ALL
                SELECT belso_mozgas_xkey FROM public.kiadas
                 WHERE belso_mozgas_xkey IS NOT NULL AND deleted = false
               ) y
         GROUP BY belso_mozgas_xkey
       ) z

UNION ALL
-- ── 7. SZAKASZ: A MAI/FRISS IMPORT NYOMAI ─────────────────────────────────
--    Az updated_at NOT NULL, default now() — ez mutatja a friss beszúrásokat.
SELECT 70,
       '7. FRISS TÉTELEK (utolsó 7 nap, updated_at szerint)',
       (u.nap::text || ' · ' || u.tabla || ' · ' || u.tip)::text,
       u.db::text,
       ''::text
  FROM (
        SELECT updated_at::date AS nap, 'kiadas'::text AS tabla,
               COALESCE(irattipus, '(NULL)') AS tip, count(*) AS db
          FROM public.kiadas
         WHERE updated_at >= CURRENT_DATE - 7
         GROUP BY 1, 3
        UNION ALL
        SELECT updated_at::date, 'befizetes'::text,
               COALESCE(irattipus, '(NULL)'), count(*)
          FROM public.befizetes
         WHERE updated_at >= CURRENT_DATE - 7
         GROUP BY 1, 3
       ) u

UNION ALL
-- ── 8. SZAKASZ: MÁR MEGLÉVŐ DUPLIKÁTUMOK (azonos iratszám, azonos év) ─────
--    Ha itt sorok jönnek, az egyediségi index tényleg nem véd a banki oldalon.
SELECT 80,
       '8a. kiadas — AZONOS iratszám ugyanabban az évben',
       (d.iratszam || ' · ' || d.ev::text)::text,
       (d.db::text || ' db')::text,
       ('irattipus: ' || d.tipusok)::text
  FROM (
        SELECT iratszam,
               EXTRACT(year FROM datum)::int AS ev,
               count(*) AS db,
               string_agg(DISTINCT COALESCE(irattipus, '(NULL)'), ', ') AS tipusok
          FROM public.kiadas
         WHERE deleted = false
         GROUP BY iratszam, EXTRACT(year FROM datum)::int, congregation_id
        HAVING count(*) > 1
       ) d

UNION ALL
SELECT 81,
       '8b. befizetes — AZONOS iratszám ugyanabban az évben',
       (d.iratszam || ' · ' || d.fizetettev::text)::text,
       (d.db::text || ' db')::text,
       ('irattipus: ' || d.tipusok)::text
  FROM (
        SELECT iratszam, fizetettev,
               count(*) AS db,
               string_agg(DISTINCT COALESCE(irattipus, '(NULL)'), ', ') AS tipusok
          FROM public.befizetes
         WHERE deleted = false
         GROUP BY iratszam, fizetettev, congregation_id
        HAVING count(*) > 1
       ) d

UNION ALL
-- ── 9. SZAKASZ: SZEMÉLY-HOZZÁRENDELÉS kitöltöttsége (3. pont) ─────────────
SELECT 90,
       '9. SZEMÉLY-HOZZÁRENDELÉS a befizetéseknél',
       ('év ' || b.fizetettev::text)::text,
       (count(*)::text || ' befizetés')::text,
       ('személyhez kötve: ' || (count(*) FILTER (WHERE b.id_szemely IS NOT NULL))::text
        || ' · családhoz: '   || (count(*) FILTER (WHERE b.id_csalad  IS NOT NULL))::text
        || ' · SEHOVÁ: '      || (count(*) FILTER (WHERE b.id_szemely IS NULL
                                                     AND b.id_csalad  IS NULL))::text)::text
  FROM public.befizetes b
 WHERE b.deleted = false
 GROUP BY b.fizetettev

UNION ALL
-- ── 10. SZAKASZ: a számadási cél-katalógus (5. és 6. ponthoz) ─────────────
--     A belsotetel flag és a típus dönti el, mi számít belső mozgásnak,
--     és melyik kategória adomány/szponzor jellegű.
SELECT 100,
       '10. SZÁMADÁSI CÉL KATALÓGUS',
       (s.j->>'id')::text,
       COALESCE(s.j->>'type', '?')::text,
       ('nev: ' || COALESCE(s.j->>'nev', '?')
        || ' · belsotetel: ' || COALESCE(s.j->>'belsotetel', 'NULL')
        || ' · aktiv: '      || COALESCE(s.j->>'aktiv', '?')
        || ' · szint: '      || COALESCE(s.j->>'szint', '?'))::text
  FROM (SELECT to_jsonb(t) AS j FROM public.szamadasicel t) s
 WHERE COALESCE(s.j->>'belsotetel', '') <> ''
    OR (s.j->>'id') ~ '^(100|30[01]|40[012])'
    OR COALESCE(s.j->>'nev', '') ~* 'adom|szponz|támogat|tamogat|persely|offert'

UNION ALL
-- ── 11. SZAKASZ: befizetescel katalógus (5. pont: adomány/szponzor) ───────
SELECT 110,
       '11. BEFIZETÉSCÉL KATALÓGUS',
       (c.j->>'id')::text,
       COALESCE(c.j->>'id_szamadasicel', '?')::text,
       ('nev: ' || COALESCE(c.j->>'nev', '?')
        || ' · belsotetel: ' || COALESCE(c.j->>'belsotetel', 'NULL')
        || ' · aktiv: '      || COALESCE(c.j->>'aktiv', '?'))::text
  FROM (SELECT to_jsonb(t) AS j FROM public.befizetescel t) c
 WHERE COALESCE(c.j->>'belsotetel', '') <> ''
    OR COALESCE(c.j->>'id_szamadasicel', '') ~ '^(100|30[01]|40[012])'
    OR COALESCE(c.j->>'nev', '') ~* 'adom|szponz|támogat|tamogat|persely|offert|egyházfenn|egyhazfenn'

UNION ALL
-- ── 12. SZAKASZ: a belsomozgas mestertábla — használatban van-e? ──────────
SELECT 120,
       '12. belsomozgas TÁBLA HASZNÁLAT',
       'sorok száma'::text,
       count(*)::text,
       'ha 0, akkor a tábla halott — a mozgás a befizetes/kiadas páron él'::text
  FROM public.belsomozgas

UNION ALL
-- ── 13. SZAKASZ: import_logs — vezet-e naplót a rendszer az importokról? ──
SELECT 130,
       '13. import_logs HASZNÁLAT',
       'sorok száma'::text,
       count(*)::text,
       'a 4./8. ponthoz: van-e nyoma a banki importoknak'::text
  FROM public.import_logs

) AS osszes
ORDER BY sorrend, targy;
