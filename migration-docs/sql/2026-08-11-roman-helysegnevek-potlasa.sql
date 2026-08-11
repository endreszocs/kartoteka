-- KARTOTEKA — A hiányzó ROMÁN helységnevek pótlása (2026-08-11)
-- Futtatja: Endre (Supabase SQL Editor). SZAKASZONKÉNT, sorban.
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIÉRT — a mért állapot
-- ════════════════════════════════════════════════════════════════════════════
-- A 2026-08-11-cim-geokodolas-allapot.sql eredménye:
--   · 606 élő, látható tagból 557-nek NEM oldható fel a települése (32. sor)
--   · 15 használt településből 12-nél HIÁNYZIK a `name_ro`
--   · 34 használt utcából 0-nak van román neve
--   · Barátoson 549 tag él — vagyis EGYETLEN sor javítása 549 kartont hoz rendbe
--
-- A Barátos-sor mérve (41–42. sor):
--     name='Barátos'  name_ro=∅  SIRUTA=∅  irsz=∅  megye='?'
-- Ugyanabban a táblában viszont OTT VAN a helyes sor:
--     name='Brateş'   name_ro='Brateş'  SIRUTA=64014  irsz=527050  megye=Covasna
-- (plusz három AZONOS NEVŰ, de MÁS megyei falu: Mehedinţi, Neamţ, Brăila —
--  ezért nem szabad pusztán névre illeszteni.)
--
-- Vagyis az adat MEGVAN, csak a használt sor nincs feltöltve. Az
-- `adrlocality_alias` tábla ~15 000 sort tartalmaz (magyar/román/német
-- névváltozatok) — ebből dolgozunk, nem találgatásból.
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIT NEM CSINÁL
-- ════════════════════════════════════════════════════════════════════════════
--  ⛔ NEM írja felül a magyar `name` oszlopot. A nyilvántartás nyelve magyar marad.
--  ⛔ NEM nyúl olyan sorhoz, amelynek MÁR VAN `name_ro`-ja.
--  ⛔ NEM köti át a tagok címét másik település-sorra (az adatvesztés-kockázat).
--  ⛔ NEM ír román nevet KÜLFÖLDI településhez. Budapest, Debrecen, Gödöllő,
--     Győr, Hollandia — ezeket a térkép a magyar nevükön is megtalálja, román
--     nevük pedig nem is létezik. Ez a 12 hiányzóból 5.

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ SZAKASZ 0 — JAVASLAT (CSAK OLVAS). Ezt futtasd ELŐSZÖR.                  ║
-- ║ Egyetlen SELECT — megmutatja, MIT írna be a 2. szakasz, és honnan.       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- HOGYAN OLVASD:
--   · `jelolt_db = 1`  → egyértelmű, a 2. szakasz automatikusan javítja
--   · `jelolt_db > 1`  → TÖBB azonos nevű falu van az országban; a 2. szakasz
--                        NEM nyúl hozzá, kézzel kell dönteni (lásd 3. szakasz)
--   · `jelolt_db = 0`  → nincs találat; marad a magyar név (külföldi vagy hiányzó)

WITH hasznalt AS (
  -- A ténylegesen használt települések: amire tag-cím mutat, közvetlenül vagy utcán át
  SELECT DISTINCT l.id, l.name, l.name_ro, l.countyid
  FROM public.adrlocality l
  WHERE l.id IN (
      SELECT s.c_helysegid FROM public.szemely s
       WHERE s.c_helysegid IS NOT NULL AND s.isvisible = true
    UNION
      SELECT st.localityid FROM public.adrstreet st
       WHERE st.id IN (SELECT s2.c_utcaid FROM public.szemely s2
                        WHERE s2.c_utcaid IS NOT NULL AND s2.isvisible = true)
  )
), hianyzo AS (
  SELECT * FROM hasznalt WHERE COALESCE(NULLIF(btrim(name_ro), ''), NULL) IS NULL
), jelolt AS (
  -- Jelöltek: olyan MÁSIK adrlocality sor, amely ugyanarra a helyre mutat —
  -- vagy alias-on át, vagy azonos néven — ÉS amelynek VAN román neve.
  SELECT h.id AS hianyzo_id, h.name AS magyar_nev,
         c.id AS jelolt_id, c.name_ro, c.siruta_code, c.default_postalcode, c.countyid,
         co.name AS megye
  FROM hianyzo h
  JOIN public.adrlocality c
    ON c.id <> h.id
   AND COALESCE(NULLIF(btrim(c.name_ro), ''), NULL) IS NOT NULL
   AND (
        EXISTS (SELECT 1 FROM public.adrlocality_alias a
                 WHERE a.adrlocality_id = c.id
                   AND lower(btrim(a.alias_name)) = lower(btrim(h.name)))
     OR lower(btrim(c.name_hu)) = lower(btrim(h.name))
   )
  LEFT JOIN public.adrcounty co ON co.id = c.countyid
)
SELECT
  h.name                                   AS magyar_nev,
  (SELECT count(*) FROM jelolt j WHERE j.hianyzo_id = h.id) AS jelolt_db,
  COALESCE((SELECT string_agg(j.name_ro || ' (' || COALESCE(j.megye, '?') || ', '
                              || COALESCE(j.default_postalcode, '—') || ')', '  ///  ')
              FROM jelolt j WHERE j.hianyzo_id = h.id), '— nincs találat') AS jeloltek,
  (SELECT count(*) FROM public.szemely s
    WHERE s.isvisible = true
      AND (s.c_helysegid = h.id
           OR s.c_utcaid IN (SELECT st.id FROM public.adrstreet st WHERE st.localityid = h.id))
  )                                        AS erintett_tag
FROM hianyzo h
ORDER BY erintett_tag DESC, h.name;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ SZAKASZ 1 — BARÁTOS (549 tag). Ez a legfontosabb sor.                    ║
-- ║ Az értékek a TE adatbázisodból származnak (a Covasna megyei Brateş sor),  ║
-- ║ nem találgatásból.                                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ MIÉRT KÉZZEL, ÉS NEM AUTOMATIKUSAN: a `Brateş` névre NÉGY sor illeszkedik
--    az országban (Covasna, Mehedinţi, Neamţ, Brăila) — három közülük egy
--    teljesen MÁS falu. Az automatika ilyenkor szándékosan nem dönt.
--    A helyes: Covasna megye, 527050 — a te gyülekezeted megyéje.

-- ⚠️ 2026-08-11 — ELSŐ PRÓBÁLKOZÁS HIBÁJA, JAVÍTVA:
--    a `siruta_code` MÁSOLÁSA egyedi-megszorításba ütközött:
--        „duplicate key value violates unique constraint adrlocality_siruta_uq"
--    Nem véletlen: a SIRUTA a település HIVATALOS, ORSZÁGOSAN EGYEDI azonosítója
--    — két sor nem viselheti ugyanazt, és a forrás-sor még használja.
--    Mivel a térképnek nincs is rá szüksége (a név + irányítószám + megye a
--    döntő), a SIRUTA-t egyszerűen NEM másoljuk. A két sor logikailag ugyanaz a
--    falu, de az adatbázisban két külön rekord — ez most nem a mi dolgunk
--    rendezni, és nem is szabad 549 tag címét más sorra átkötni.

BEGIN;

UPDATE public.adrlocality AS cel
   SET name_ro            = forras.name_ro,
       -- SIRUTA SZÁNDÉKOSAN KIMARAD (egyedi megszorítás, lásd fent)
       default_postalcode = COALESCE(cel.default_postalcode, forras.default_postalcode),
       countyid           = forras.countyid
  FROM public.adrlocality AS forras
  JOIN public.adrcounty  AS megye ON megye.id = forras.countyid
 WHERE cel.name = 'Barátos'
   AND COALESCE(NULLIF(btrim(cel.name_ro), ''), NULL) IS NULL   -- idempotens
   AND forras.name_ro = 'Brateş'
   AND megye.name = 'Covasna'                                    -- a HELYES falu
   AND forras.default_postalcode = '527050';

-- A „Főút" román alakja. Ugyanígy: csak ha még üres.
UPDATE public.adrstreet
   SET name_ro        = 'Principală',
       street_type_ro = 'Strada'
 WHERE lower(btrim(name)) = 'főút'
   AND COALESCE(NULLIF(btrim(name_ro), ''), NULL) IS NULL
   AND localityid IN (SELECT id FROM public.adrlocality WHERE name = 'Barátos');

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ELLENŐRZÉS (EGYETLEN SELECT) ───────────────────────────────────────────
SELECT x.sorrend, x.mit_mer, x.ertek, x.vart,
       CASE WHEN x.ertek = x.vart THEN '✅' ELSE '❌' END AS rendben
FROM (
  SELECT 1 AS sorrend, 'Barátos: van már román név'::text AS mit_mer,
         COALESCE((SELECT name_ro FROM public.adrlocality
                    WHERE name = 'Barátos' LIMIT 1), '∅ HIÁNYZIK')::text AS ertek,
         'Brateş'::text AS vart
  UNION ALL SELECT 2, 'Barátos: irányítószám',
         COALESCE((SELECT default_postalcode FROM public.adrlocality
                    WHERE name = 'Barátos' LIMIT 1), '∅'), '527050'
  UNION ALL SELECT 3, 'Barátos: megye',
         COALESCE((SELECT co.name FROM public.adrlocality l
                     JOIN public.adrcounty co ON co.id = l.countyid
                    WHERE l.name = 'Barátos' LIMIT 1), '∅'), 'Covasna'
  UNION ALL SELECT 4, 'Főút: román név',
         COALESCE((SELECT st.name_ro FROM public.adrstreet st
                     JOIN public.adrlocality l ON l.id = st.localityid
                    WHERE l.name = 'Barátos' AND lower(btrim(st.name)) = 'főút'
                    LIMIT 1), '∅ HIÁNYZIK'), 'Principală'
  UNION ALL SELECT 5, 'A magyar név ÉRINTETLEN maradt',
         COALESCE((SELECT name FROM public.adrlocality
                    WHERE name_ro = 'Brateş' AND default_postalcode = '527050'
                      AND name = 'Barátos' LIMIT 1), '∅'), 'Barátos'
  UNION ALL SELECT 6, 'Feloldhatatlan települesű élő tagok száma',
         (SELECT count(*)::text FROM public.szemely s
           WHERE s.isvisible = true
             AND NOT EXISTS (
               SELECT 1 FROM public.adrlocality l
                WHERE (l.id = s.c_helysegid
                       OR l.id = (SELECT st.localityid FROM public.adrstreet st
                                   WHERE st.id = s.c_utcaid))
                  AND COALESCE(NULLIF(btrim(l.name_ro), ''), NULL) IS NOT NULL)),
         '57'   -- VÁRT: 606 − 549 ; ha ennél kisebb, annál jobb
) x
ORDER BY x.sorrend;

-- A 6. sor VÁRT értéke 57 körüli: a barátosi 549 tag rendbe jött, a maradék a
-- többi (nagyrészt KÜLFÖLDI) településhez tartozik. Ha pontosan 57-et kapsz,
-- minden a terv szerint ment.


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ SZAKASZ 2 — a többi belföldi település (KÉZI, a 0. szakasz alapján)      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- A 0. szakasz megmondja, melyiknél EGYÉRTELMŰ a jelölt. Ahol `jelolt_db = 1`,
-- ott az alábbi sablon biztonságos — cseréld ki a két nevet:
--
--   BEGIN;
--   UPDATE public.adrlocality AS cel
--      SET name_ro            = forras.name_ro,
--          -- SIRUTA-t NE másolj: országosan egyedi, ütközne (23505).
--          default_postalcode = COALESCE(cel.default_postalcode, forras.default_postalcode),
--          countyid           = forras.countyid
--     FROM public.adrlocality AS forras
--    WHERE cel.name = 'MAGYAR NÉV'
--      AND COALESCE(NULLIF(btrim(cel.name_ro), ''), NULL) IS NULL
--      AND forras.id = <a 0. szakaszban látott jelölt id>;
--   COMMIT;
--
-- ⚠️ KÜLFÖLDI településhez (Budapest, Debrecen, Gödöllő, Győr, Hollandia) NE
--    írj román nevet — a térkép a magyar nevükön is megtalálja őket.
-- ⚠️ A „?" nevű sor hibás adat — ÉS NEM KEVÉS TAGOT ÉRINT. A 2026-08-11-i éles
--    mérés szerint 70 ÉLŐ TAG címe mutat rá: ez a gyülekezet legnagyobb egyetlen
--    adathiba-csoportja. Ne ITT próbáld javítani, és NE adj neki román nevet:
--    a 70 tag mind MÁSHOL lakik, egyetlen sor feltöltése mindet egy hamis
--    településre szegezné. A rendszer erre saját tételt ad a tagnyilvántartás
--    Hibák fülén („Ebből a lakcímből hiányzik a település…"), tagonként
--    végigvezetve, fogyó számlálóval — azt kövesd.


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ VISSZAÁLLÍTÁS — csak baj esetén                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--   BEGIN;
--   UPDATE public.adrlocality
--      SET name_ro = NULL, default_postalcode = NULL   -- SIRUTA-t nem írtunk
--    WHERE name = 'Barátos';
--   UPDATE public.adrstreet SET name_ro = NULL, street_type_ro = NULL
--    WHERE lower(btrim(name)) = 'főút'
--      AND localityid IN (SELECT id FROM public.adrlocality WHERE name = 'Barátos');
--   COMMIT;
-- (A `countyid`-t NEM állítja vissza — az eredetileg egy „?" placeholder volt.)
