-- =====================================================================
-- PR-44 — VÁLÁS RÖGZÍTÉSE: előkészítő DIAGNOSZTIKA
-- Dátum: 2026-08-04
--
-- FONTOS: a PR-44 funkció NEM igényel séma- vagy függvénymódosítást.
--   - a `szemely.allapot` oszlop létezik (szabad szöveg, CHECK nélkül),
--   - a `szemely_kapcsolat.megjegyzes` szabad szöveg (a 'valas' és a
--     'valas-utani-szulo' jelölő oda kerül),
--   - a `tagnyilvantartas_csalad_mentes` RPC NULL-t tud írni az
--     id_ferfi / id_no mezőbe, tehát felszabadítja az egyediségi index helyét.
--
-- Ez a fájl CSAK ELLENŐRZŐ LEKÉRDEZÉSEKET tartalmaz (4 blokk) + egy
-- OPCIONÁLIS, kikommentezett javító UPDATE-et. Futtatása nem kötelező,
-- de az 2. és a 4. blokk eredménye érdemi információt ad.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) A `csalad` egyediségi indexek tényleges alakja
--    (a válás-út arra épül, hogy az id_ferfi/id_no UNIQUE ... WHERE NOT NULL)
-- ---------------------------------------------------------------------
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'csalad'
ORDER BY indexname;

-- ---------------------------------------------------------------------
-- 2) KRITIKUS: milyen `allapot` értékek élnek ma a nyilvántartásban?
--
--    A kód PONTOS egyezésre épül: allapot = 'elvált' (kisbetű, ékezettel,
--    pont nélkül). Ebből lesz az „elv." név-előtag, és erre szűrnek a
--    kerületi statisztikák is. Ha a listában 'Elvált', 'elvált.', 'ELVÁLT'
--    vagy 'elvalt' szerepel, azok ma NÉMÁN kimaradnak a kimutatásokból.
-- ---------------------------------------------------------------------
SELECT allapot, count(*) AS db
FROM szemely
WHERE allapot IS NOT NULL
GROUP BY allapot
ORDER BY db DESC;

-- ---------------------------------------------------------------------
-- 3) OPCIONÁLIS normalizálás — CSAK a 2) blokk eredményének ismeretében,
--    és csak akkor, ha tényleg vannak eltérő írásmódú értékek!
--    (Vedd le a kommentet, ha futtatni akarod.)
-- ---------------------------------------------------------------------
-- UPDATE szemely
-- SET allapot = 'elvált'
-- WHERE allapot IS NOT NULL
--   AND allapot <> 'elvált'
--   AND lower(btrim(allapot, ' .')) IN ('elvált', 'elvalt');

-- ---------------------------------------------------------------------
-- 4) „ÚJRAHÁZASODÁSI CSAPDA" — kik foglalják LEZÁRT kartonon a férj/feleség
--    helyet? Az egyediségi index a lezárt kartonokra IS érvényes, ezért
--    ezek a személyek egy másik kartonra felnőttként nem vehetők fel
--    (a mentés „duplicate key" hibára fut). A PR-44 óta a kereső ezt
--    magyarázó jelvénnyel jelzi — a végleges rendezés a válás rögzítése
--    a régi kartonon (vagy a régi karton felnőtt tagjainak javítása).
-- ---------------------------------------------------------------------
SELECT c.id AS csalad_id,
       c.isaktiv,
       s.id AS szemely_id,
       s.csaladnev,
       s.k_nev,
       CASE WHEN s.id = c.id_ferfi THEN 'férj' ELSE 'feleség' END AS szerep
FROM csalad c
JOIN szemely s ON s.id IN (c.id_ferfi, c.id_no)
WHERE c.isaktiv = false
ORDER BY c.id;

-- ---------------------------------------------------------------------
-- 5) Ellenőrzés a válás rögzítése UTÁN (a lelkész kérésére futtatható):
--    a lezárt válás-élek és a védett szülő-élek listája.
-- ---------------------------------------------------------------------
-- SELECT k.id, k.tipus, k.id_szemely_1, k.id_szemely_2, k.ervenyes_ig, k.megjegyzes
-- FROM szemely_kapcsolat k
-- WHERE k.megjegyzes IN ('valas', 'valas-utani-szulo')
-- ORDER BY k.ervenyes_ig DESC NULLS LAST, k.id;
