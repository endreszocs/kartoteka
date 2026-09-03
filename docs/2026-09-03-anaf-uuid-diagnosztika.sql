-- =============================================================================
-- ANAF-AZONOSÍTÓ DIAGNOSZTIKA  (2026-09-03)
-- =============================================================================
--
-- ⚠️ EZ CSAK OLVAS. Egyetlen sort sem módosít, nem hoz létre és nem töröl.
--    Nyugodtan futtatható éles adatbázison, bármikor.
--
-- ── MIT VIZSGÁLUNK ──────────────────────────────────────────────────────────
--
-- A befogadott e-Facturák azonosítója (`anaf_uuid`) ma három lépcsőben áll elő
-- (`apps/web/lib/oblio/ubl-parser.ts` → `anafUuidFajlnevbol`):
--   1. az XML gyökér `cbc:UUID` mezője (ez a JÓ eset), ennek híján
--   2. a FÁJLNÉVBEN talált első, legalább 8 jegyű SZÁM-FUTAM, ennek híján
--   3. ⛔ MAGA A CSUPASZ FÁJLNÉV (kiterjesztés nélkül).
--
-- A 3. lépcső két, ellentétes irányú bajt okozhat:
--   (A) UGYANAZ a számla KÉTSZER: ha ugyanaz a számla két úton érkezik (SPV-ből
--       `SUPPLIER_EFI123_6245906283.xml`, a szállítótól e-mailben
--       `Factura_martie.xml`), két KÜLÖNBÖZŐ kulcsot kap → két tartozás-sor.
--   (B) NÉMA VESZTÉS: két KÜLÖNBÖZŐ szállító `factura.xml`-je AZONOS kulcsot kap.
--       A `UNIQUE (congregation_id, anaf_uuid)` miatt a második NEM kerül be;
--       a felület „Már korábban rögzített számlák" felirattal nyugtázza, és a
--       második szállító követelése nyomtalanul eltűnik.
--
-- ⛔ FONTOS KORLÁT: a (B) eset UTÓLAG NEM MÉRHETŐ — ami sosem került be, arról
--    az adatbázisban nincs nyom. Amit mérni tudunk: hány sor áll KOCKÁZATOS
--    (fájlnév-alapú) kulcson, azaz mekkora a felület, ahol ez megtörténhetett.
--
-- ── MI LESZ AZ EREDMÉNYBŐL ──────────────────────────────────────────────────
-- A javítás iránya attól függ, mit mutat:
--   · ha a kockázatos kulcsok száma 0 → a javítás tisztán megelőző, nyugodtan
--     mehet a jövőre nézve, meglévő adatot nem kell hozzányúlni;
--   · ha van kockázatos kulcs → a kulcsképzés váltásához MIGRÁCIÓ is kell,
--     különben minden korábbi számla MÁSODSZOR is bekerülne;
--   · a 4. és 5. blokk megmondja, hogy a tervezett ÚJ kulcs
--     (szállító CUI + számlaszám) egyáltalán képezhető-e a meglévő adatból.
--
-- ── FUTTATÁS: KÉT LÉPÉSBEN ──────────────────────────────────────────────────
--
-- ⚠️ ELŐSZÖR a „0. LÉPÉS" blokkot futtasd (lentebb, közvetlenül ez alatt).
--    Az megmondja, hogy a két vizsgált tábla LÉTEZIK-E egyáltalán élesben.
--    Erre azért van szükség, mert a repóban lévő séma-dump 2026-07-10-i, a
--    `szallitoi_szamla` migrációja viszont 2026-08-15-i — a dumpból tehát nem
--    dönthető el, mi van élesben. (A repó szabálya: a migrációs fájl NEM
--    bizonyíték.) Ha valamelyik tábla hiányzik, a fő lekérdezés hibára futna.
--
-- ⚠️ MÁSODSZOR a „FŐ DIAGNOSZTIKA" blokkot futtasd, EGYBEN. Egyetlen
--    eredmény-rácsot ad (a szerkesztő csak az utolsót mutatná, ezért van
--    UNION ALL-lal összefűzve).
-- =============================================================================


-- =============================================================================
-- 0. LÉPÉS — LÉTEZNEK-E A TÁBLÁK?  (ezt futtasd elsőnek, önmagában)
-- =============================================================================
SELECT
  t.tabla,
  CASE WHEN to_regclass('public.' || t.tabla) IS NULL
    THEN '❌ NINCS MEG élesben — szólj, és a fő lekérdezésből kiveszem'
    ELSE '✅ létezik'
  END AS allapot
FROM (VALUES
  ('szallitoi_szamla'),
  ('oblio_kiadas_match')
) AS t(tabla);


-- =============================================================================
-- FŐ DIAGNOSZTIKA  (csak akkor, ha fent MINDKETTŐ „✅ létezik")
-- =============================================================================

WITH
-- A kulcs ALAKJA szerinti besorolás. A `~` POSIX-regex, kis/nagybetű-érzékeny.
besorolt AS (
  SELECT
    sz.id,
    sz.congregation_id,
    sz.anaf_uuid,
    sz.szallito_cui,
    sz.szamla_szam,
    sz.kiallitas_datum,
    sz.szallito_nev,
    sz.osszeg,
    sz.created_at,
    CASE
      -- Valódi UUID (8-4-4-4-12) — az XML cbc:UUID-jából. BIZTONSÁGOS.
      WHEN sz.anaf_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN '1 · valódi UUID (XML-ből)'
      -- Csak számjegyek, legalább 8 — ANAF-index vagy fájlnév-szám-futam.
      -- Ütközés elvileg lehetséges, gyakorlatilag valószínűtlen.
      WHEN sz.anaf_uuid ~ '^[0-9]{8,}$'
        THEN '2 · szám-azonosító (8+ jegy)'
      -- ⛔ MINDEN MÁS: csupasz fájlnév-visszaesés. EZ A KOCKÁZATOS HALMAZ.
      ELSE '3 · ⛔ FÁJLNÉV-VISSZAESÉS'
    END AS kulcs_fajta
  FROM public.szallitoi_szamla sz
),
-- Ugyanaz a SZÁMLA kétszer? (A eset) — azonos gyülekezet + CUI + számlaszám,
-- de KÜLÖNBÖZŐ anaf_uuid. A normalizálás (nagybetű + szóköz-trim) azért kell,
-- mert a két forrás eltérően írhatja.
duplikalt_szamla AS (
  SELECT
    congregation_id,
    upper(btrim(szallito_cui)) AS cui,
    upper(btrim(szamla_szam))  AS szam,
    count(*)                   AS db,
    string_agg(DISTINCT anaf_uuid, ' | ' ORDER BY anaf_uuid) AS kulcsok
  FROM public.szallitoi_szamla
  WHERE szallito_cui IS NOT NULL AND btrim(szallito_cui) <> ''
    AND szamla_szam  IS NOT NULL AND btrim(szamla_szam)  <> ''
  GROUP BY 1, 2, 3
  HAVING count(DISTINCT anaf_uuid) > 1
),
-- Ugyanez a mappa-alapú (asztali) ágon: az `oblio_kiadas_match` ugyanabból a
-- parserből kapja a kulcsot.
match_besorolt AS (
  SELECT
    CASE
      WHEN m.anaf_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN '1 · valódi UUID (XML-ből)'
      WHEN m.anaf_uuid ~ '^[0-9]{8,}$'
        THEN '2 · szám-azonosító (8+ jegy)'
      ELSE '3 · ⛔ FÁJLNÉV-VISSZAESÉS'
    END AS kulcs_fajta,
    m.anaf_uuid
  FROM public.oblio_kiadas_match m
)

SELECT * FROM (

  -- ── 1) A FELTÖLTÉS-ELSŐ ÚT (szallitoi_szamla) kulcs-összetétele ──────────
  SELECT
    1                       AS blokk,
    'A · feltöltött számlák kulcs-fajtái'      AS vizsgalat,
    b.kulcs_fajta           AS reszlet,
    count(*)::text          AS ertek,
    CASE
      WHEN b.kulcs_fajta LIKE '3 %' AND count(*) > 0
        THEN '⛔ EZEK A KOCKÁZATOS SOROK — a kulcsváltásnál migrálni kell őket'
      ELSE '✅ stabil azonosító'
    END                     AS ertekeles
  FROM besorolt b
  GROUP BY b.kulcs_fajta

  UNION ALL

  -- ── 2) A MAPPA-ALAPÚ (ASZTALI) ÚT ugyanez ───────────────────────────────
  SELECT
    2,
    'B · asztali párosítások kulcs-fajtái',
    mb.kulcs_fajta,
    count(*)::text,
    CASE
      WHEN mb.kulcs_fajta LIKE '3 %' AND count(*) > 0
        THEN '⛔ ugyanaz a kockázat az asztali ágon'
      ELSE '✅ stabil azonosító'
    END
  FROM match_besorolt mb
  GROUP BY mb.kulcs_fajta

  UNION ALL

  -- ── 3) A LEGVESZÉLYESEBB KULCSOK: rövid vagy általános fájlnevek ─────────
  --     (pl. „factura", „f1", „scan001") — ezek ütköznek a legkönnyebben.
  SELECT
    3,
    'C · legveszélyesebb kulcsok',
    b.anaf_uuid || '  ←  ' || coalesce(b.szallito_nev, '(nincs szállítónév)'),
    coalesce(b.szamla_szam, '(nincs számlaszám)') || ' · ' || coalesce(b.kiallitas_datum::text, '?'),
    '⛔ ha egy MÁSIK szállító ugyanígy nevezett fájlt tölt fel, az NÉMÁN elveszik'
  FROM besorolt b
  WHERE b.kulcs_fajta LIKE '3 %'
    AND (length(b.anaf_uuid) <= 20 OR b.anaf_uuid !~ '[0-9]')

  UNION ALL

  -- ── 4) UGYANAZ A SZÁMLA KÉTSZER? (A eset — ez MÉRHETŐ) ──────────────────
  SELECT
    4,
    'D · ugyanaz a számla két kulcson',
    d.cui || ' · ' || d.szam,
    d.db::text || ' sor',
    '⛔ KETTŐS TARTOZÁS-NYILVÁNTARTÁS — kulcsok: ' || d.kulcsok
  FROM duplikalt_szamla d

  UNION ALL

  -- ── 5) KÉPEZHETŐ-E A TERVEZETT ÚJ KULCS? (CUI + számlaszám) ─────────────
  --     Ha sok sornál hiányzik valamelyik, az új kulcs nem lehet KIZÁRÓLAGOS —
  --     kell mellé megtartani a mai értéket másodlagos keresési kulcsként.
  --     (A besorolás ALKÉRDÉSBEN készül: így a csoportosítás és az értékelés is
  --      ugyanarra a kifejezésre hivatkozik, nem nyers oszlopra.)
  SELECT
    5,
    'E · az új kulcs képezhetősége',
    k.allapot,
    count(*)::text,
    CASE WHEN k.allapot = 'CUI + számlaszám megvan'
      THEN '✅ ezeknél az új kulcs képezhető'
      ELSE '⚠️ ezeknél az ÚJ kulcs sem képezhető — marad a mai érték'
    END
  FROM (
    SELECT
      CASE
        WHEN szallito_cui IS NULL OR btrim(szallito_cui) = ''
          THEN 'hiányzik a szállító CUI'
        WHEN szamla_szam IS NULL OR btrim(szamla_szam) = ''
          THEN 'hiányzik a számlaszám'
        ELSE 'CUI + számlaszám megvan'
      END AS allapot
    FROM public.szallitoi_szamla
  ) k
  GROUP BY k.allapot

  UNION ALL

  -- ── 6) ÜTKÖZNE-E AZ ÚJ KULCS ÖNMAGÁVAL? ─────────────────────────────────
  --     Ha ugyanaz a (gyülekezet + CUI + számlaszám) többször szerepel, akkor
  --     az új kulcsra sem lehet UNIQUE-ot tenni előzetes takarítás nélkül.
  SELECT
    6,
    'F · ütközne-e az új kulcs',
    'azonos gyülekezet + CUI + számlaszám, több sorral',
    count(*)::text,
    CASE WHEN count(*) > 0
      THEN '⚠️ előbb takarítani kell (lásd a D blokkot), csak utána jöhet UNIQUE'
      ELSE '✅ az új kulcs egyedi lenne'
    END
  FROM duplikalt_szamla

  UNION ALL

  -- ── 7) ÖSSZKÉP ──────────────────────────────────────────────────────────
  SELECT
    7,
    'G · összkép',
    'feltöltött szállítói számla összesen',
    (SELECT count(*)::text FROM public.szallitoi_szamla),
    CASE
      WHEN (SELECT count(*) FROM besorolt WHERE kulcs_fajta LIKE '3 %') = 0
        THEN '✅ EGYETLEN fájlnév-alapú kulcs sincs — a javítás tisztán megelőző, migráció nem kell'
      ELSE '⛔ van fájlnév-alapú kulcs — a javításhoz migráció is kell'
    END

) AS diagnosztika
ORDER BY blokk, vizsgalat, reszlet;

-- =============================================================================
-- HOGYAN OLVASD
-- =============================================================================
-- · A blokk „A" és „B" a lényeg: ha a „3 · ⛔ FÁJLNÉV-VISSZAESÉS" sor
--   darabszáma 0, akkor a javítás kockázat nélkül elvégezhető.
-- · A „C" blokk sorai a konkrét veszélyes kulcsok — érdemes ránézni, hogy
--   felismered-e őket (pl. tényleg „factura.xml" néven jött-e valami).
-- · A „D" blokk a MÁR MEGTÖRTÉNT kettős rögzítéseket mutatja. Ha itt van sor,
--   azok valós, duplán nyilvántartott tartozások — ezeket kézzel kell rendezni.
-- · Az „E"/„F" blokk arról szól, hogy a tervezett új kulcs egyáltalán
--   használható-e a meglévő adatokon.
-- · A „G" blokk egy mondatban összefoglal.
--
-- Küldd vissza az eredményt, és eldöntjük, kell-e migráció a javításhoz.
-- =============================================================================
