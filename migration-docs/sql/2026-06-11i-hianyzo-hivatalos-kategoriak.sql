-- ============================================================================
-- KARTOTÉKA — Kategória-készlet ellenőrzés v2 (2026-06-11) · EGYETLEN lekérdezés
--
-- FRISSÍTÉS: Endre képernyőképe alapján kiderült, hogy a 87-es hivatalos
-- katalógus EGYHÁZMEGYEI tételeket is tartalmaz — az egyházközségi bevétel-
-- lista 30 tételes. A ti 31-etek tehát NEM hiányos! Ez a lekérdezés most már
-- ezt a tudást hordozza: a bevétel-oldalon pontosan jelzi, mi gyülekezeti és
-- mi egyházmegyei; a kiadás-oldalt a kiadási képernyőkép igazolja majd.
--
-- FUTTATÁS: Supabase → SQL Editor → Run → a TELJES eredményt másold vissza.
-- CSAK OLVAS. Az "allapot" oszlop magyarul mondja meg a teendőt.
-- ============================================================================
WITH hivatalos(kod, hivatalos_nev, vart_szint) AS (
  VALUES
  ('101.01', 'Egyházfenntartói járulék', 'gyülekezeti (a képen szerepel)'),
  ('101.02', 'Bevételek a különböző egyházi szolgálatokért', 'gyülekezeti (a képen szerepel)'),
  ('101.03', 'Perselypénz', 'gyülekezeti (a képen szerepel)'),
  ('101.04', 'Adományok hívektől, egyházi intézményektől', 'gyülekezeti (a képen szerepel)'),
  ('101.05', 'Úrasztali adományok', 'gyülekezeti (a képen szerepel)'),
  ('101.06', 'Sírhelyek eladásából, bérleti díjából, gondozásából származó bevételek', 'gyülekezeti (a képen szerepel)'),
  ('101.07', 'Központi járulékok - egyházmegyei bevétel', 'EGYHÁZMEGYEI — rendben, ha nincs felvéve'),
  ('101.08', 'Egyházközségek fizetésalapja - emei bevétel', 'EGYHÁZMEGYEI — rendben, ha nincs felvéve'),
  ('102.01', 'Gyerek és ifjúsági tevékenységek bevételei', 'gyülekezeti (a képen szerepel)'),
  ('102.02', 'Nőszövetségi tevékenységek bevételei', 'gyülekezeti (a képen szerepel)'),
  ('102.03', 'Presbiterszövetségi tevékenységek bevételei', 'gyülekezeti (a képen szerepel)'),
  ('102.04', 'Diakóniai célú adományok', 'gyülekezeti (a képen szerepel)'),
  ('102.05', 'Missziós célú adományok', 'gyülekezeti (a képen szerepel)'),
  ('102.06', 'Legátumok - adományok teológiai hallgatók támogatására', 'gyülekezeti (a képen szerepel)'),
  ('103.01', 'Segélyszervezetektől, alapítványoktól, helyi szervezetektől származó adományok', 'gyülekezeti (a képen szerepel)'),
  ('103.02', 'Pályázatokból', 'gyülekezeti (a képen szerepel)'),
  ('103.03', 'Más bevételek', 'gyülekezeti (a képen szerepel)'),
  ('103.04', 'Banki kamatok, árfolyam nyereségek, kötvények jövedelme, osztalékok', 'gyülekezeti (a képen szerepel)'),
  ('103.05', 'Hozzájárulás konferenciák és szeretetvendégségek szervezéséhez', 'gyülekezeti (a képen szerepel)'),
  ('103.06', 'Iratterjesztés - bevétel', 'gyülekezeti (a képen szerepel)'),
  ('103.07', 'Javak és részvények értékesítéséből', 'gyülekezeti (a képen szerepel)'),
  ('103.08', 'Számlavisszatérítések', 'gyülekezeti (a képen szerepel)'),
  ('103.09', 'Szponzortámogatások, adók 3,5 %-a', 'gyülekezeti (a képen szerepel)'),
  ('104.01', 'Mezőgazdasági jövedelem', 'gyülekezeti (a képen szerepel)'),
  ('104.02', 'Erdőgazdálkodási jövedelem', 'gyülekezeti (a képen szerepel)'),
  ('104.03', 'Más gazdasági bevételek', 'gyülekezeti (a képen szerepel)'),
  ('104.04', 'Épületek bérjövedelme', 'gyülekezeti (a képen szerepel)'),
  ('104.05', 'Területek bérjövedelme', 'gyülekezeti (a képen szerepel)'),
  ('105.01', 'Más egyházi intézményektől kapott támogatás', 'gyülekezeti (a képen szerepel)'),
  ('105.02', 'Állami intézménytől kapott támogatás (APIA, stb.)', 'gyülekezeti (a képen szerepel)'),
  ('105.03', 'Kongrua és járulékai', 'EGYHÁZMEGYEI — rendben, ha nincs felvéve'),
  ('106.01', 'Bevételek más egyházi intézmények részére', 'EGYHÁZMEGYEI — rendben, ha nincs felvéve'),
  ('106.02', 'Biztosítások - bevétel', 'EGYHÁZMEGYEI — rendben, ha nincs felvéve'),
  ('106.03', 'Missziói segélyek', 'EGYHÁZMEGYEI — rendben, ha nincs felvéve'),
  ('106.04', 'Bérjövedelmek 10%-a', 'EGYHÁZMEGYEI — rendben, ha nincs felvéve'),
  ('106.05', 'Bevételek egyházközségek részére', 'EGYHÁZMEGYEI — rendben, ha nincs felvéve'),
  ('106.06', 'Bevételek a felsőbb egyházi intézmények részére', 'EGYHÁZMEGYEI — rendben, ha nincs felvéve'),
  ('107.01', 'Kapott hitelek', 'gyülekezeti (a képen szerepel)'),
  ('107.02', 'Visszakapott hitelek', 'gyülekezeti (a képen szerepel)'),
  ('201.01', 'Fizetés alap', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('201.02', 'Közköltségek (fűtés, világítás, víz stb.)', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('201.03', 'Házbérek', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('201.04', 'Épületadó, földadó biztosítás', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('201.05', 'Szállítóeszközök üzemeltetési költségei', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('201.06', 'Napidíj, utazási költségek', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('201.07', 'Posta, telefon, internet', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('201.08', 'Irodaszerek, nyomtatványok', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('201.09', 'Fogyóanyagok, más anyagok', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('201.10', 'Szolgáltatások költségei', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('201.11', 'Protokoll', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('201.12', 'Kis értékű leltári tárgyak beszerzése', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('201.13', 'Karbantartási kiadások', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('201.14', 'Más javadalmak', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('201.15', 'Nettó fizetések', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('201.16', 'Javadalmak utáni adó', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('201.17', 'Társadalombiztosítás', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('201.18', 'Egészségügyi biztosítás', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('201.19', 'Munkabiztosítási hozzájárulás - 2,25%', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('202.01', 'Gyerek és ifjúsági tevékenységek kiadásai', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('202.02', 'Nőszövetségi tevékenységek kiadásai', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('202.03', 'Presbiterszövetségi tevékenységek kiadásai', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('202.04', 'Egyházközségek, vagy más egyházi intézmények támogatása', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('202.05', 'Kiadások diakóniai célokra', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('202.06', 'Missziós célú kiadások', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('202.07', 'Teológiai hallgatók tanulmányi segélye - legátumok', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('202.08', 'Egyháztagok segélyezése', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('203.01', 'Szociális-kulturális tevékenységek támogatása', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('203.02', 'Más kiadások', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('203.03', 'Kezelési költségek, árfolyam veszteségek, kötvényeladási veszteségek', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('203.04', 'Konferenciák és szeretetvendégségek költségei', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('203.05', 'Iratterjesztés - kiadás', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('203.06', 'Központi járulékok', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('203.07', 'Bérjövedelmek 10%-a központi járulékba', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('204.01', 'Mezőgazdasági kiadások', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('204.02', 'Erdőgazdálkodási kiadások', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('204.03', 'Más gazdasági kiadások', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('204.04', 'Bérbeadott épületek javítása és karbantartása', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('205.01', 'Új beruházások', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('205.02', 'Általános javítások', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('206.01', 'Kiadás más egyházi intézmény részére', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('206.02', 'Biztosítások - kiadás', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('206.03', 'Kifizetett missziói segélyek', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('206.04', 'Kifizetett bérjövedelmek 10%-a', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('206.05', 'Kiadások egyházközségek részére', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('206.06', 'Kiadások a felsőbb egyházi intézmények részére', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('207.01', 'Törlesztett hitelek', 'ellenőrizendő (kiadás-oldali kép alapján)'),
  ('207.02', 'Kiadott hitelek', 'ellenőrizendő (kiadás-oldali kép alapján)')
)
SELECT
  h.kod,
  h.hivatalos_nev,
  h.vart_szint,
  CASE
    WHEN s.id IS NULL THEN 'NINCS A RENDSZERBEN'
    WHEN h.kod LIKE '1%' AND b.id IS NOT NULL AND b.aktiv = true
         AND (s.szint IS NULL OR s.szint = 'gyulekezet') THEN 'VÁLASZTHATÓ a rögzítőben'
    WHEN h.kod LIKE '2%' AND k.id IS NOT NULL AND k.aktiv = true
         AND (s.szint IS NULL OR s.szint = 'gyulekezet') THEN 'VÁLASZTHATÓ a rögzítőben'
    WHEN s.szint IS NOT NULL AND s.szint <> 'gyulekezet' THEN 'egyházmegyei/kerületi szintként jelölve'
    WHEN h.kod LIKE '1%' AND b.id IS NULL THEN 'nincs felvéve a választékba'
    WHEN h.kod LIKE '2%' AND k.id IS NULL THEN 'nincs felvéve a választékba'
    ELSE 'inaktív'
  END AS allapot
FROM hivatalos h
LEFT JOIN szamadasicel s ON s.id = h.kod
LEFT JOIN befizetescel b ON b.id_szamadasicel = h.kod
LEFT JOIN kiadascel    k ON k.id_szamadasicel = h.kod
ORDER BY h.kod;
