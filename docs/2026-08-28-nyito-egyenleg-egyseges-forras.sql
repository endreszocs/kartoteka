-- =====================================================================
-- 2026-08-28 — NYITÓ EGYENLEG: EGYETLEN KANONIKUS FORRÁS
--
-- Endre döntése: „A gyülekezet beállításainál legyenek a nyitó egyenlegek,
-- EGY [helyen], és onnan számoljon mindent!"
--
-- Ez a fájl KÉT DOLGOT csinál, ebben a sorrendben:
--   1) DIAGNOSZTIKA (csak SELECT) — eldönti, kell-e egyáltalán adat-átvezetés;
--   2) DOKUMENTÁLÓ megjegyzések (COMMENT ON COLUMN) — hogy a DB-ben is látszódjon,
--      melyik oszlop a kanonikus és melyik a kivezetett.
--
-- ⛔ OSZLOP-TÖRLÉS NINCS BENNE, és szándékosan nem is lesz. A
--    `bankszamlak.nyito_egyenleg` és a `bealitas.nyito_*` oszlopok MEGMARADNAK:
--    a felsőbb (megyei/kerületi) szintnek az előbbi ma is az EGYETLEN banki
--    nyitó-tárolója, mert a kanonikus tábla `congregation_id`-je NOT NULL.
--
-- ⛔ AUTOMATIKUS BACKFILL SINCS BENNE. A legacy skalárhoz NEM tartozik ÉV; bármely
--    évbe beírni annyi lenne, mint egy hivatalos számadás kiindulópontját legyártani
--    úgy, hogy azt senki nem hagyta jóvá. Ha az 1a) lista nem üres, a rögzítés a
--    Gyülekezet beállításai → Nyitó egyenlegek felületen történik, soronként.
--
-- BIZTONSÁG: az 1. blokk kizárólag olvas. A 2. blokk csak metaadat-megjegyzést ír
-- (semmilyen sort nem érint). Visszafordítható.
-- =====================================================================


-- =====================================================================
-- 1. BLOKK — DIAGNOSZTIKA (csak SELECT)
--
-- ⚠️ A Supabase SQL editor CSAK AZ UTOLSÓ eredmény-rácsot mutatja, ezért az
--    öt kérdés EGYETLEN `UNION ALL`-ban áll, a blokk végén.
--
-- ⚠️ A darabszámok értelmezésekor: a teszt-gyülekezet (7e57…0003) sorai is
--    beleszámítanak — a `hatokor` oszlop megmutatja, melyik gyülekezetről van szó.
-- =====================================================================

WITH
-- 1a) A DÖNTŐ KÉRDÉS: van-e olyan bankszámla, ahol CSAK a legacy skalárban van
--     érték, és a kanonikus (évenkénti) táblában EGYETLEN sor sincs?
--     ⇒ Ha ez ÜRES, adat-átvezetés NEM KELL: a kód-változtatás nulla adathatással megy.
arva_skalar AS (
  SELECT
    b.id,
    b.scope,
    b.congregation_id,
    b.bank_neve,
    b.valuta,
    b.aktiv,
    b.nyito_egyenleg,
    (SELECT count(*) FROM public.bankszamla_nyito_egyenleg n WHERE n.bankszamla_id = b.id) AS kanonikus_sorok
  FROM public.bankszamlak b
  WHERE COALESCE(b.nyito_egyenleg, 0) <> 0
),

-- 1b) A FELSŐBB SZINTŰ számlák: ezeknek a skalár marad az EGYETLEN nyitó-tárolójuk.
--     Ez mondja meg, mekkora számot véd a hatókör-szűkített ág a kódban.
felso_szint AS (
  SELECT b.id, b.scope, b.bank_neve, b.valuta, b.nyito_egyenleg
  FROM public.bankszamlak b
  WHERE b.scope IS DISTINCT FROM 'gyulekezet'
),

-- 1c) A 4. tároló (`bealitas.nyito_*`): tényleg mindenhol 0?
--     Ha van nem-nulla, azt valaki valaha beírta — és a rendszer SOHA nem használta.
halott_tarolo AS (
  SELECT congregation_id, id AS eve, nyito_keszpenz, nyito_bank
  FROM public.bealitas
  WHERE COALESCE(nyito_keszpenz, 0) <> 0 OR COALESCE(nyito_bank, 0) <> 0
),

-- 1d) A forrásból NEM eldönthető kérdés lezárása: olvassa-e DB-oldali NÉZET a
--     kivezetett oszlopokat? (Függvényeket a blokk után külön kérdezünk.)
nezet_olvaso AS (
  SELECT schemaname, viewname
  FROM pg_views
  WHERE schemaname = 'public'
    AND (definition ILIKE '%nyito_bank%'
      OR definition ILIKE '%nyito_keszpenz%')
),

-- 1e) A kassza-nyitó sorok FORRÁS szerint — mennyit írt eddig felül az import?
--     (A kódban most már forrás-védelem van: a `manual` sort nem írja felül.)
kassza_forras AS (
  SELECT forrasa, count(*) AS db, min(eve) AS legkorabbi, max(eve) AS legkesobbi
  FROM public.keszpenz_nyito_egyenleg
  GROUP BY forrasa
)

SELECT '1a) ÁRVA legacy skalár (nincs kanonikus sora)' AS kerdes,
       (b.bank_neve || ' · ' || COALESCE(b.scope, '?') || ' · ' || b.valuta) AS reszlet,
       ('skalár: ' || b.nyito_egyenleg::text || ' · kanonikus sorok: ' || b.kanonikus_sorok::text
        || CASE WHEN b.kanonikus_sorok = 0 THEN '  ⛔ ÁTVEZETÉS KELL' ELSE '  ✅ van kanonikus' END) AS eredmeny
FROM arva_skalar b
UNION ALL
SELECT '1a) ÁRVA legacy skalár (nincs kanonikus sora)', '(nincs ilyen számla)',
       '✅ ADAT-ÁTVEZETÉS NEM KELL — a kivezetés nulla adathatással megy'
WHERE NOT EXISTS (SELECT 1 FROM arva_skalar WHERE kanonikus_sorok = 0)
UNION ALL
SELECT '1b) FELSŐBB SZINTŰ számla (a skalár marad az egyetlen tárolója)',
       (f.bank_neve || ' · ' || COALESCE(f.scope, '?')),
       f.nyito_egyenleg::text
FROM felso_szint f
UNION ALL
SELECT '1b) FELSŐBB SZINTŰ számla (a skalár marad az egyetlen tárolója)', '(nincs ilyen számla)',
       '➖ nincs megyei/kerületi bankszámla — a hatókör-szűkített ág ma nem is sül el'
WHERE NOT EXISTS (SELECT 1 FROM felso_szint)
UNION ALL
SELECT '1c) HALOTT tároló (bealitas.nyito_*) nem-nulla értékkel',
       (h.congregation_id::text || ' · ' || h.eve::text),
       ('keszpenz: ' || COALESCE(h.nyito_keszpenz, 0)::text || ' · bank: ' || COALESCE(h.nyito_bank, 0)::text)
FROM halott_tarolo h
UNION ALL
SELECT '1c) HALOTT tároló (bealitas.nyito_*) nem-nulla értékkel', '(mindenhol 0)',
       '✅ a halott tároló üres — az írásának elhagyása nulla adathatású'
WHERE NOT EXISTS (SELECT 1 FROM halott_tarolo)
UNION ALL
SELECT '1d) DB-oldali NÉZET olvassa a kivezetett oszlopot?',
       (n.schemaname || '.' || n.viewname),
       '⚠️ ÁTNÉZENDŐ — a kód-oldali kivezetés ezt nem érinti'
FROM nezet_olvaso n
UNION ALL
SELECT '1d) DB-oldali NÉZET olvassa a kivezetett oszlopot?', '(nincs ilyen nézet)',
       '✅ egyetlen nézet sem olvassa'
WHERE NOT EXISTS (SELECT 1 FROM nezet_olvaso)
UNION ALL
SELECT '1e) Kassza-nyitó sorok forrás szerint',
       k.forrasa,
       (k.db::text || ' db · ' || k.legkorabbi::text || '–' || k.legkesobbi::text)
FROM kassza_forras k
ORDER BY 1, 2;


-- ── 1f) DB-oldali FÜGGVÉNY olvassa-e a kivezetett oszlopokat? ────────────
-- Külön lekérdezés, mert a `pg_get_functiondef` nem vonható be a fenti
-- típus-egységes UNION-ba anélkül, hogy a rács olvashatatlanná válna.
-- ⚠️ EZT IS FUTTASD LE, és az eredményét is küldd el.
SELECT
  '1f) DB-függvény olvassa a kivezetett oszlopot?' AS kerdes,
  p.oid::regprocedure::text AS fuggveny
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND pg_get_functiondef(p.oid) ILIKE '%nyito_bank%';


-- =====================================================================
-- 2. BLOKK — DOKUMENTÁLÓ MEGJEGYZÉSEK
--
-- Csak metaadat: egyetlen adatsort sem érint. Azért kell, mert a következő
-- olvasó (ember vagy gép) a DB-ben is lássa, melyik oszlop a kanonikus —
-- különben fél év múlva valaki jóhiszeműen újra rákot a legacy oszlopra.
-- =====================================================================

COMMENT ON COLUMN public.bankszamlak.nyito_egyenleg IS
  'KIVEZETVE a GYÜLEKEZETI számításból (2026-08-28, Endre döntése). '
  'Kanonikus forrás: bankszamla_nyito_egyenleg (ÉVENKÉNTI), a Gyülekezet '
  'beállításai → Nyitó egyenlegek felületről szerkesztve. '
  'Ez az oszlop ÉV NÉLKÜLI. Ma már CSAK a MEGYEI/KERÜLETI Registru Banca olvassa, '
  'mert a kanonikus tábla congregation_id-je NOT NULL, tehát a felsőbb szintnek '
  'nincs hova rögzítenie. Amíg ez így van, az oszlop NEM törölhető.';

COMMENT ON COLUMN public.bealitas.nyito_keszpenz IS
  'HALOTT tároló (2026-08-28) — NINCS olvasója sem az appban, sem a magban. '
  'Kanonikus: keszpenz_nyito_egyenleg (évenkénti). Az oszlop megmarad, de a '
  'kód már nem írja; a DEFAULT 0 ugyanazt a számot tartja.';

COMMENT ON COLUMN public.bealitas.nyito_bank IS
  'HALOTT tároló (2026-08-28) — NINCS olvasója sem az appban, sem a magban. '
  'Élesben 0,00 állt benne, miközben a valós banki nyitó 107 771,39 volt. '
  'Kanonikus: bankszamla_nyito_egyenleg (évenkénti).';

COMMENT ON TABLE public.bankszamla_nyito_egyenleg IS
  'KANONIKUS banki nyitó egyenleg, ÉVENKÉNT és számlánként (2026-08-28). '
  'Ez az EGYETLEN forrás a gyülekezeti számításhoz: Számadás, Bank fül, '
  'Registru Banca, Költségvetés. Írja: a Gyülekezet beállításai → Nyitó '
  'egyenlegek felület, a banki import, és az automatikus carryover. '
  'Véglegesített évre (accounting_finalized VAGY budget_finalized) nem írható.';

COMMENT ON TABLE public.keszpenz_nyito_egyenleg IS
  'KANONIKUS készpénz (kassza) nyitó egyenleg, ÉVENKÉNT (2026-08-28). '
  'Ez az EGYETLEN forrás a gyülekezeti számításhoz. A forrasa=''manual'' sort '
  'az Excel-import 2026-08-28 óta NEM írja felül — helyette figyelmeztet.';


-- ── KAPU: a megjegyzések tényleg felkerültek? ────────────────────────────
SELECT
  'MEGJEGYZÉS' AS ellenorzes,
  c.relname || '.' || a.attname AS oszlop,
  CASE WHEN col_description(c.oid, a.attnum) IS NULL THEN '⛔ HIÁNYZIK'
       ELSE '✅ ' || left(col_description(c.oid, a.attnum), 60) || '…' END AS eredmeny
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid
WHERE n.nspname = 'public'
  AND (
    (c.relname = 'bankszamlak' AND a.attname = 'nyito_egyenleg') OR
    (c.relname = 'bealitas'    AND a.attname IN ('nyito_keszpenz', 'nyito_bank'))
  )
UNION ALL
SELECT
  'MEGJEGYZÉS',
  c.relname || ' (tábla)',
  CASE WHEN obj_description(c.oid, 'pg_class') IS NULL THEN '⛔ HIÁNYZIK'
       ELSE '✅ ' || left(obj_description(c.oid, 'pg_class'), 60) || '…' END
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('bankszamla_nyito_egyenleg', 'keszpenz_nyito_egyenleg')
ORDER BY 1, 2;
