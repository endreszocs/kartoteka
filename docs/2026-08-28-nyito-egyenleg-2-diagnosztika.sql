-- =====================================================================
-- 2026-08-28 — NYITÓ EGYENLEG: DIAGNOSZTIKA (2. rész)
--
-- MIÉRT KÜLÖN FÁJL: az első fájl (`2026-08-28-nyito-egyenleg-egyseges-forras.sql`)
-- lefutott, és a `COMMENT ON COLUMN` megjegyzések fel is kerültek (mind az 5 ✅).
-- A DIAGNOSZTIKA eredménye viszont NEM látszott, mert a Supabase SQL editor
-- CSAK AZ UTOLSÓ eredmény-rácsot mutatja — az pedig ott a megjegyzés-kapu volt.
-- Ez az én fájl-szerkesztési hibám volt, nem a lekérdezésé.
--
-- EBBEN A FÁJLBAN EGYETLEN EREDMÉNY-RÁCS VAN, és az a diagnosztika.
--
-- ⛔ CSAK OLVAS. Egyetlen sort, oszlopot és megjegyzést sem ír.
--
-- MIT DÖNT EL: kell-e egyáltalán adat-átvezetés ahhoz, hogy a nyitó egyenleg
-- egyetlen forrása (a `bankszamla_nyito_egyenleg` / `keszpenz_nyito_egyenleg`
-- ÉVENKÉNTI táblák) teljes legyen. A DÖNTŐ SOR az „1a)" — ha ott az áll, hogy
-- ÁTVEZETÉS NEM KELL, akkor nincs több teendő.
-- =====================================================================

WITH
-- 1a) A DÖNTŐ KÉRDÉS: van-e olyan bankszámla, ahol CSAK a régi, ÉV NÉLKÜLI
--     skalárban van érték, a kanonikus (évenkénti) táblában pedig EGY SOR SEM?
arva_skalar AS (
  SELECT
    b.id,
    COALESCE(b.scope, 'gyulekezet')                                   AS scope,
    b.congregation_id,
    COALESCE(b.bank_neve, '(névtelen)')                               AS bank_neve,
    COALESCE(b.valuta, 'RON')                                         AS valuta,
    b.aktiv,
    COALESCE(b.nyito_egyenleg, 0)                                     AS legacy_skalar,
    (SELECT count(*) FROM public.bankszamla_nyito_egyenleg n
      WHERE n.bankszamla_id = b.id)                                   AS kanonikus_sorok,
    (SELECT min(n.eve) FROM public.bankszamla_nyito_egyenleg n
      WHERE n.bankszamla_id = b.id)                                   AS legkorabbi_kanonikus_ev
  FROM public.bankszamlak b
  WHERE COALESCE(b.nyito_egyenleg, 0) <> 0
),

-- 1b) A FELSŐBB SZINTŰ (megyei/kerületi) számlák. EZEKNEK a régi skalár marad az
--     EGYETLEN nyitó-tárolójuk — a kanonikus tábla `congregation_id`-je NOT NULL,
--     tehát a megyének nincs hova rögzítenie. Ez a lista mondja meg, mekkora
--     számot véd a kódban a hatókör-szűkített ág.
felso_szint AS (
  SELECT b.id,
         COALESCE(b.scope, '?')            AS scope,
         COALESCE(b.bank_neve, '(névtelen)') AS bank_neve,
         COALESCE(b.valuta, 'RON')         AS valuta,
         COALESCE(b.nyito_egyenleg, 0)     AS legacy_skalar
  FROM public.bankszamlak b
  WHERE COALESCE(b.scope, 'gyulekezet') <> 'gyulekezet'
),

-- 1c) A HALOTT 4. tároló (`bealitas.nyito_*`): tényleg mindenhol 0?
--     Ha van nem-nulla, azt valaki valaha beírta — és a rendszer SOHA nem olvasta.
halott_tarolo AS (
  SELECT b.congregation_id,
         b.id                              AS eve,
         COALESCE(b.nyito_keszpenz, 0)     AS nyito_keszpenz,
         COALESCE(b.nyito_bank, 0)         AS nyito_bank
  FROM public.bealitas b
  WHERE COALESCE(b.nyito_keszpenz, 0) <> 0
     OR COALESCE(b.nyito_bank, 0) <> 0
),

-- 1d) Olvassa-e DB-oldali NÉZET a kivezetett oszlopokat?
nezet_olvaso AS (
  SELECT v.schemaname, v.viewname
  FROM pg_views v
  WHERE v.schemaname = 'public'
    AND (v.definition ILIKE '%nyito_bank%'
      OR v.definition ILIKE '%nyito_keszpenz%')
),

-- 1e) Olvassa-e DB-oldali FÜGGVÉNY a kivezetett oszlopokat?
--     (Ez az a kérdés, amit a FORRÁSKÓDBÓL nem lehet eldönteni.)
fuggveny_olvaso AS (
  SELECT p.oid::regprocedure::text AS fuggveny
  FROM pg_proc p
  JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public'
    AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ILIKE '%nyito_bank%'
),

-- 1f) A kassza-nyitó sorok FORRÁS szerint. A kódban most már forrás-védelem van:
--     a `manual` (kézzel jóváhagyott) sort az import NEM írja felül.
kassza_forras AS (
  SELECT COALESCE(k.forrasa, '(nincs megadva)') AS forrasa,
         count(*)                               AS db,
         min(k.eve)                             AS legkorabbi,
         max(k.eve)                             AS legkesobbi
  FROM public.keszpenz_nyito_egyenleg k
  GROUP BY COALESCE(k.forrasa, '(nincs megadva)')
),

-- 1g) A banki nyitó sorok forrás szerint — ugyanez a bank-oldalon.
bank_forras AS (
  SELECT COALESCE(n.forrasa, '(nincs megadva)') AS forrasa,
         count(*)                               AS db,
         min(n.eve)                             AS legkorabbi,
         max(n.eve)                             AS legkesobbi
  FROM public.bankszamla_nyito_egyenleg n
  GROUP BY COALESCE(n.forrasa, '(nincs megadva)')
)

-- ── AZ EGYETLEN EREDMÉNY-RÁCS ────────────────────────────────────────────
SELECT '1a) DÖNTŐ — árva legacy skalár'::text AS kerdes,
       (a.bank_neve || ' · ' || a.scope || ' · ' || a.valuta)::text AS reszlet,
       ('skalár: ' || a.legacy_skalar::text
        || ' · kanonikus sorok: ' || a.kanonikus_sorok::text
        || CASE WHEN a.kanonikus_sorok = 0
                THEN '  ⛔ ÁTVEZETÉS KELL (ehhez a számlához nincs évenkénti nyitó)'
                ELSE '  ✅ van kanonikus sor (legkorábbi: ' || COALESCE(a.legkorabbi_kanonikus_ev::text, '?') || ')'
           END)::text AS eredmeny
FROM arva_skalar a

UNION ALL
SELECT '1a) DÖNTŐ — árva legacy skalár'::text,
       '(nincs ilyen számla)'::text,
       '✅ ADAT-ÁTVEZETÉS NEM KELL — a kivezetés nulla adathatással megy'::text
WHERE NOT EXISTS (SELECT 1 FROM arva_skalar WHERE kanonikus_sorok = 0)

UNION ALL
SELECT '1b) Felsőbb szintű számla (a skalár marad az egyetlen tárolója)'::text,
       (f.bank_neve || ' · ' || f.scope || ' · ' || f.valuta)::text,
       f.legacy_skalar::text
FROM felso_szint f

UNION ALL
SELECT '1b) Felsőbb szintű számla (a skalár marad az egyetlen tárolója)'::text,
       '(nincs ilyen számla)'::text,
       '➖ nincs megyei/kerületi bankszámla — a hatókör-szűkített ág ma nem is sül el'::text
WHERE NOT EXISTS (SELECT 1 FROM felso_szint)

UNION ALL
SELECT '1c) Halott tároló (bealitas.nyito_*) nem-nulla értékkel'::text,
       (COALESCE(h.congregation_id::text, '(nincs gyülekezet)') || ' · ' || h.eve::text)::text,
       ('keszpenz: ' || h.nyito_keszpenz::text || ' · bank: ' || h.nyito_bank::text)::text
FROM halott_tarolo h

UNION ALL
SELECT '1c) Halott tároló (bealitas.nyito_*) nem-nulla értékkel'::text,
       '(mindenhol 0)'::text,
       '✅ üres — az írásának elhagyása nulla adathatású volt'::text
WHERE NOT EXISTS (SELECT 1 FROM halott_tarolo)

UNION ALL
SELECT '1d) DB-oldali NÉZET olvassa a kivezetett oszlopot?'::text,
       (n.schemaname || '.' || n.viewname)::text,
       '⚠️ ÁTNÉZENDŐ — a kód-oldali kivezetés ezt NEM érinti'::text
FROM nezet_olvaso n

UNION ALL
SELECT '1d) DB-oldali NÉZET olvassa a kivezetett oszlopot?'::text,
       '(nincs ilyen nézet)'::text,
       '✅ egyetlen nézet sem olvassa'::text
WHERE NOT EXISTS (SELECT 1 FROM nezet_olvaso)

UNION ALL
SELECT '1e) DB-oldali FÜGGVÉNY olvassa a kivezetett oszlopot?'::text,
       fo.fuggveny::text,
       '⚠️ ÁTNÉZENDŐ — a kód-oldali kivezetés ezt NEM érinti'::text
FROM fuggveny_olvaso fo

UNION ALL
SELECT '1e) DB-oldali FÜGGVÉNY olvassa a kivezetett oszlopot?'::text,
       '(nincs ilyen függvény)'::text,
       '✅ egyetlen függvény sem olvassa'::text
WHERE NOT EXISTS (SELECT 1 FROM fuggveny_olvaso)

UNION ALL
SELECT '1f) Kassza-nyitó sorok forrás szerint'::text,
       kf.forrasa::text,
       (kf.db::text || ' db · ' || kf.legkorabbi::text || '–' || kf.legkesobbi::text)::text
FROM kassza_forras kf

UNION ALL
SELECT '1f) Kassza-nyitó sorok forrás szerint'::text,
       '(nincs egyetlen sor sem)'::text,
       '⚠️ a kassza-nyitó sehol nincs rögzítve'::text
WHERE NOT EXISTS (SELECT 1 FROM kassza_forras)

UNION ALL
SELECT '1g) Banki nyitó sorok forrás szerint'::text,
       bf.forrasa::text,
       (bf.db::text || ' db · ' || bf.legkorabbi::text || '–' || bf.legkesobbi::text)::text
FROM bank_forras bf

UNION ALL
SELECT '1g) Banki nyitó sorok forrás szerint'::text,
       '(nincs egyetlen sor sem)'::text,
       '⚠️ a banki nyitó sehol nincs rögzítve'::text
WHERE NOT EXISTS (SELECT 1 FROM bank_forras)

ORDER BY 1, 2;
