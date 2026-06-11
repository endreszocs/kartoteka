-- ============================================================================
-- KARTOTÉKA — Kategória-készlet ellenőrzés v3 (2026-06-11) · EGYETLEN lekérdezés
--
-- VÉGLEGES TUDÁS (Endre két képernyőképe alapján): az egyházközségi készlet
-- 30 bevétel + 38 kiadás = 68; a katalógus további 19 tétele (9+10) felsőbb
-- szintű. A DB kiadás-oldala (38) PONTOSAN egyezik; a bevétel-oldal 31 — az
-- 1 többletet a külön duplikátum-szkript mutatja meg.
--
-- FUTTATÁS: Supabase → SQL Editor → Run → a TELJES eredményt másold vissza.
-- CSAK OLVAS. JÓ EREDMÉNY: minden „gyülekezeti" sor = 'VÁLASZTHATÓ', minden
-- „EGYHÁZMEGYEI" sor = 'rendben (nincs felvéve)'.
-- ============================================================================
WITH hivatalos(kod, hivatalos_nev, vart_szint) AS (
  VALUES
  ('101.01', 'Egyházfenntartói járulék', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('101.02', 'Bevételek a különböző egyházi szolgálatokért', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('101.03', 'Perselypénz', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('101.04', 'Adományok hívektől, egyházi intézményektől', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('101.05', 'Úrasztali adományok', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('101.06', 'Sírhelyek eladásából, bérleti díjából, gondozásából származó bevételek', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('101.07', 'Központi járulékok - egyházmegyei bevétel', 'EGYHÁZMEGYEI/felsőbb — rendben, ha nincs felvéve'),
  ('101.08', 'Egyházközségek fizetésalapja - emei bevétel', 'EGYHÁZMEGYEI/felsőbb — rendben, ha nincs felvéve'),
  ('102.01', 'Gyerek és ifjúsági tevékenységek bevételei', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('102.02', 'Nőszövetségi tevékenységek bevételei', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('102.03', 'Presbiterszövetségi tevékenységek bevételei', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('102.04', 'Diakóniai célú adományok', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('102.05', 'Missziós célú adományok', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('102.06', 'Legátumok - adományok teológiai hallgatók támogatására', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('103.01', 'Segélyszervezetektől, alapítványoktól, helyi szervezetektől származó adományok', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('103.02', 'Pályázatokból', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('103.03', 'Más bevételek', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('103.04', 'Banki kamatok, árfolyam nyereségek, kötvények jövedelme, osztalékok', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('103.05', 'Hozzájárulás konferenciák és szeretetvendégségek szervezéséhez', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('103.06', 'Iratterjesztés - bevétel', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('103.07', 'Javak és részvények értékesítéséből', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('103.08', 'Számlavisszatérítések', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('103.09', 'Szponzortámogatások, adók 3,5 %-a', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('104.01', 'Mezőgazdasági jövedelem', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('104.02', 'Erdőgazdálkodási jövedelem', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('104.03', 'Más gazdasági bevételek', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('104.04', 'Épületek bérjövedelme', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('104.05', 'Területek bérjövedelme', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('105.01', 'Más egyházi intézményektől kapott támogatás', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('105.02', 'Állami intézménytől kapott támogatás (APIA, stb.)', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('105.03', 'Kongrua és járulékai', 'EGYHÁZMEGYEI/felsőbb — rendben, ha nincs felvéve'),
  ('106.01', 'Bevételek más egyházi intézmények részére', 'EGYHÁZMEGYEI/felsőbb — rendben, ha nincs felvéve'),
  ('106.02', 'Biztosítások - bevétel', 'EGYHÁZMEGYEI/felsőbb — rendben, ha nincs felvéve'),
  ('106.03', 'Missziói segélyek', 'EGYHÁZMEGYEI/felsőbb — rendben, ha nincs felvéve'),
  ('106.04', 'Bérjövedelmek 10%-a', 'EGYHÁZMEGYEI/felsőbb — rendben, ha nincs felvéve'),
  ('106.05', 'Bevételek egyházközségek részére', 'EGYHÁZMEGYEI/felsőbb — rendben, ha nincs felvéve'),
  ('106.06', 'Bevételek a felsőbb egyházi intézmények részére', 'EGYHÁZMEGYEI/felsőbb — rendben, ha nincs felvéve'),
  ('107.01', 'Kapott hitelek', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('107.02', 'Visszakapott hitelek', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('201.01', 'Fizetés alap', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('201.02', 'Közköltségek (fűtés, világítás, víz stb.)', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('201.03', 'Házbérek', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('201.04', 'Épületadó, földadó biztosítás', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('201.05', 'Szállítóeszközök üzemeltetési költségei', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('201.06', 'Napidíj, utazási költségek', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('201.07', 'Posta, telefon, internet', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('201.08', 'Irodaszerek, nyomtatványok', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('201.09', 'Fogyóanyagok, más anyagok', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('201.10', 'Szolgáltatások költségei', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('201.11', 'Protokoll', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('201.12', 'Kis értékű leltári tárgyak beszerzése', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('201.13', 'Karbantartási kiadások', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('201.14', 'Más javadalmak', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('201.15', 'Nettó fizetések', 'EGYHÁZMEGYEI/felsőbb — rendben, ha nincs felvéve'),
  ('201.16', 'Javadalmak utáni adó', 'EGYHÁZMEGYEI/felsőbb — rendben, ha nincs felvéve'),
  ('201.17', 'Társadalombiztosítás', 'EGYHÁZMEGYEI/felsőbb — rendben, ha nincs felvéve'),
  ('201.18', 'Egészségügyi biztosítás', 'EGYHÁZMEGYEI/felsőbb — rendben, ha nincs felvéve'),
  ('201.19', 'Munkabiztosítási hozzájárulás - 2,25%', 'EGYHÁZMEGYEI/felsőbb — rendben, ha nincs felvéve'),
  ('202.01', 'Gyerek és ifjúsági tevékenységek kiadásai', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('202.02', 'Nőszövetségi tevékenységek kiadásai', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('202.03', 'Presbiterszövetségi tevékenységek kiadásai', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('202.04', 'Egyházközségek, vagy más egyházi intézmények támogatása', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('202.05', 'Kiadások diakóniai célokra', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('202.06', 'Missziós célú kiadások', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('202.07', 'Teológiai hallgatók tanulmányi segélye - legátumok', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('202.08', 'Egyháztagok segélyezése', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('203.01', 'Szociális-kulturális tevékenységek támogatása', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('203.02', 'Más kiadások', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('203.03', 'Kezelési költségek, árfolyam veszteségek, kötvényeladási veszteségek', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('203.04', 'Konferenciák és szeretetvendégségek költségei', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('203.05', 'Iratterjesztés - kiadás', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('203.06', 'Központi járulékok', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('203.07', 'Bérjövedelmek 10%-a központi járulékba', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('204.01', 'Mezőgazdasági kiadások', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('204.02', 'Erdőgazdálkodási kiadások', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('204.03', 'Más gazdasági kiadások', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('204.04', 'Bérbeadott épületek javítása és karbantartása', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('205.01', 'Új beruházások', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('205.02', 'Általános javítások', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('206.01', 'Kiadás más egyházi intézmény részére', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('206.02', 'Biztosítások - kiadás', 'EGYHÁZMEGYEI/felsőbb — rendben, ha nincs felvéve'),
  ('206.03', 'Kifizetett missziói segélyek', 'EGYHÁZMEGYEI/felsőbb — rendben, ha nincs felvéve'),
  ('206.04', 'Kifizetett bérjövedelmek 10%-a', 'EGYHÁZMEGYEI/felsőbb — rendben, ha nincs felvéve'),
  ('206.05', 'Kiadások egyházközségek részére', 'EGYHÁZMEGYEI/felsőbb — rendben, ha nincs felvéve'),
  ('206.06', 'Kiadások a felsőbb egyházi intézmények részére', 'EGYHÁZMEGYEI/felsőbb — rendben, ha nincs felvéve'),
  ('207.01', 'Törlesztett hitelek', 'gyülekezeti (a hivatalos Excel-listán szerepel)'),
  ('207.02', 'Kiadott hitelek', 'gyülekezeti (a hivatalos Excel-listán szerepel)')
)
SELECT
  h.kod,
  h.hivatalos_nev,
  h.vart_szint,
  CASE
    WHEN s.id IS NULL THEN 'NINCS A RENDSZERBEN'
    WHEN h.kod LIKE '1%' AND b.id IS NOT NULL AND b.aktiv = true
         AND (s.szint IS NULL OR s.szint = 'gyulekezet') THEN 'VÁLASZTHATÓ'
    WHEN h.kod LIKE '2%' AND k.id IS NOT NULL AND k.aktiv = true
         AND (s.szint IS NULL OR s.szint = 'gyulekezet') THEN 'VÁLASZTHATÓ'
    WHEN s.szint IS NOT NULL AND s.szint <> 'gyulekezet' THEN 'rendben (felsőbb szintként jelölve)'
    WHEN h.kod LIKE '1%' AND b.id IS NULL THEN 'rendben (nincs felvéve)'
    WHEN h.kod LIKE '2%' AND k.id IS NULL THEN 'rendben (nincs felvéve)'
    ELSE 'inaktív'
  END AS allapot
FROM hivatalos h
LEFT JOIN szamadasicel s ON s.id = h.kod
LEFT JOIN befizetescel b ON b.id_szamadasicel = h.kod
LEFT JOIN kiadascel    k ON k.id_szamadasicel = h.kod
ORDER BY h.kod;
