-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ⚠️ SÜRGŐS ELLENŐRZÉS — az `anon` és a TRUNCATE jogok        2026-08-25   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ EZ A FÁJL SEMMIT NEM MÓDOSÍT. Csak a katalógust olvassa.
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIÉRT SÜRGŐS
-- ════════════════════════════════════════════════════════════════════════════
-- A B5+B7 felmérés mellékesen ezt hozta vissza a `congregations` tábláról:
--
--     anon jogai: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
-- Az `anon` a BEJELENTKEZÉS NÉLKÜLI szerep. A legtöbb műveletet az RLS még
-- megfogja (ha nincs rájuk engedő policy, a sor-szintű védelem tagad).
--
-- ⛔ DE A `TRUNCATE`-RE AZ RLS NEM VONATKOZIK.
--    A PostgreSQL-ben a sor-szintű védelem a SELECT / INSERT / UPDATE / DELETE
--    műveletekre él. A TRUNCATE tábla-szintű parancs: kizárólag a TRUNCATE
--    jogosultság dönt róla. Akinek megvan, az RLS-től függetlenül ki tudja
--    üríteni a táblát.
--
-- Ez a lekérdezés megmondja, HÁNY tábla van ilyen állapotban. A repóban van
-- egy 2026-04-17-i `anon`-szigorítás, de az egy KÉZI FELSOROLÁS volt — a
-- `congregations` kimaradt belőle, és azóta sok új tábla született.
--
-- ════════════════════════════════════════════════════════════════════════════
-- FUTTASD LE, ÉS KÜLDD VISSZA MIND A HÁROM EREDMÉNYT
-- (mindhárom EGY-EGY önálló lekérdezés — futtasd őket egyesével,
--  vagy jelöld ki és futtasd külön, hogy mindhárom eredményét lásd)
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. ÖSSZKÉP: hány tábla ad jogot az anon-nak, és milyet? ────────────────
-- Ez az EGY sor megmondja a baj méretét.

SELECT
  count(*) FILTER (WHERE jogok LIKE '%TRUNCATE%')                    AS anon_truncate_tablak,
  count(*) FILTER (WHERE jogok LIKE '%DELETE%')                      AS anon_delete_tablak,
  count(*) FILTER (WHERE jogok LIKE '%INSERT%' OR jogok LIKE '%UPDATE%') AS anon_iro_tablak,
  count(*) FILTER (WHERE jogok LIKE '%SELECT%')                      AS anon_olvaso_tablak,
  count(*)                                                           AS anon_erintett_tablak_osszesen,
  (SELECT count(*) FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE')         AS osszes_publikus_tabla
FROM (
  SELECT table_name,
         string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type) AS jogok
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee='anon'
  GROUP BY table_name
) x;


-- ── 2. TÉTELESEN: mely táblákon van anon TRUNCATE / DELETE / írás? ─────────
-- Ezekre kell a REVOKE. A `rls_all` oszlop megmutatja, hogy az RLS legalább a
-- sor-műveleteket fogja-e — a TRUNCATE-et akkor SEM fogja.

SELECT
  g.table_name                                                        AS tabla,
  string_agg(DISTINCT g.privilege_type, ', ' ORDER BY g.privilege_type) AS anon_jogai,
  c.relrowsecurity                                                    AS rls_bekapcsolva,
  CASE
    WHEN bool_or(g.privilege_type = 'TRUNCATE')
      THEN '⛔⛔ TRUNCATE — az RLS NEM fogja meg, a tábla kiüríthető'
    WHEN bool_or(g.privilege_type IN ('INSERT','UPDATE','DELETE')) AND NOT c.relrowsecurity
      THEN '⛔⛔ írás RLS NÉLKÜL'
    WHEN bool_or(g.privilege_type IN ('INSERT','UPDATE','DELETE'))
      THEN '⚠️ írás — az RLS-en múlik, hogy tagad-e'
    WHEN NOT c.relrowsecurity
      THEN '⛔ olvasás RLS NÉLKÜL'
    ELSE 'ℹ️ olvasás — az RLS-en múlik'
  END                                                                 AS kockazat
FROM information_schema.role_table_grants g
JOIN pg_class c     ON c.relname = g.table_name
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE g.table_schema = 'public' AND g.grantee = 'anon'
GROUP BY g.table_name, c.relrowsecurity
ORDER BY
  bool_or(g.privilege_type = 'TRUNCATE') DESC,
  bool_or(g.privilege_type IN ('INSERT','UPDATE','DELETE')) DESC,
  g.table_name;


-- ── 3. UGYANEZ a bejelentkezett szerepre: hol van TRUNCATE? ────────────────
-- Az `authenticated` TRUNCATE-je kevésbé súlyos (kell hozzá fiók), de ugyanúgy
-- megkerüli az RLS-t: BÁRMELY bejelentkezett felhasználó kiüríthetné a táblát.

SELECT
  g.table_name AS tabla,
  'authenticated' AS szerep,
  '⛔ TRUNCATE — az RLS NEM fogja meg' AS kockazat
FROM information_schema.role_table_grants g
WHERE g.table_schema='public' AND g.grantee='authenticated'
  AND g.privilege_type='TRUNCATE'
ORDER BY g.table_name;


-- ════════════════════════════════════════════════════════════════════════════
-- MI TÖRTÉNIK EZUTÁN
-- ════════════════════════════════════════════════════════════════════════════
-- Az eredmény alapján írok egy REVOKE-migrációt. Az jellemzően így néz ki:
--
--     REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
--     REVOKE ALL ON public.congregations FROM anon;
--     GRANT SELECT (…csak a jegyzék-oszlopok…) ON public.congregations TO anon;
--
-- ⚠️ De ELŐBB látnom kell a listát, mert:
--   · a publikus gyülekezeti oldal (/gy/[slug]) BEJELENTKEZÉS NÉLKÜL működik,
--     tehát az `anon` OLVASÁSI jogát nem lehet vakon elvenni — meg kell nézni,
--     mely táblák kellenek hozzá;
--   · a `REFERENCES` és a `TRIGGER` jog elvétele ártalmatlan, a `TRUNCATE`-é
--     szintén — ezeket az alkalmazás soha nem használja;
--   · az ALAPÉRTELMEZETT JOGOKAT is rendezni kell
--     (`ALTER DEFAULT PRIVILEGES`), különben a KÖVETKEZŐ új tábla ugyanígy
--     születik meg. Ez a tartós javítás; enélkül ez a kör fél év múlva
--     megismétlődne.
-- ════════════════════════════════════════════════════════════════════════════
