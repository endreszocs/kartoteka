-- ============================================================================
-- KARTOTÉKA — Hiányzó hivatalos kategóriák kimutatása (2026-06-11)
--
-- MIT CSINÁL (egyszerűen): a hivatalos EREK-lista 87 könyvelhető kategóriáját
-- (39 bevétel + 48 kiadás) egyenként összeveti azzal, ami a rendszerben
-- ténylegesen választható. Az eredmény MINDEN hiányosságot névvel mutat.
--
-- HOGYAN FUTTASD: Supabase → SQL Editor → illeszd be az egészet → Run →
-- (EGYETLEN lekérdezés — a teljes eredmény megjelenik) →
-- a TELJES eredményt másold vissza a beszélgetésbe. CSAK OLVAS, nem módosít.
--
-- MIT JELENT AZ EREDMÉNY ("allapot" oszlop):
--   'RENDBEN'                 — a kategória felvehető a rögzítőben, minden jó
--   'HIANYZIK A VALASZTEKBOL' — a hivatalos listán szerepel, de a rögzítő
--                               választékából hiányzik (ezt pótolni kell)
--   'INAKTIV'                 — felvették, de ki van kapcsolva
--   'ROSSZ SZINT'             — tévesen egyházmegyeinek/kerületinek jelölve,
--                               ezért nem látszik a gyülekezeti rögzítőben
--   'NINCS A SZAMADASICEL-BEN'— maga az alap-kategória hiányzik a rendszerből
-- ============================================================================

WITH hivatalos(kod, hivatalos_nev) AS (
  VALUES
  ('101.01', 'Egyházfenntartói járulék'),
  ('101.02', 'Bevételek a különböző egyházi szolgálatokért'),
  ('101.03', 'Perselypénz'),
  ('101.04', 'Adományok hívektől, egyházi intézményektől'),
  ('101.05', 'Úrasztali adományok'),
  ('101.06', 'Sírhelyek eladásából, bérleti díjából, gondozásából származó bevételek'),
  ('101.07', 'Központi járulékok - egyházmegyei bevétel'),
  ('101.08', 'Egyházközségek fizetésalapja - emei bevétel'),
  ('102.01', 'Gyerek és ifjúsági tevékenységek bevételei'),
  ('102.02', 'Nőszövetségi tevékenységek bevételei'),
  ('102.03', 'Presbiterszövetségi tevékenységek bevételei'),
  ('102.04', 'Diakóniai célú adományok'),
  ('102.05', 'Missziós célú adományok'),
  ('102.06', 'Legátumok - adományok teológiai hallgatók támogatására'),
  ('103.01', 'Segélyszervezetektől, alapítványoktól, helyi szervezetektől származó adományok'),
  ('103.02', 'Pályázatokból'),
  ('103.03', 'Más bevételek'),
  ('103.04', 'Banki kamatok, árfolyam nyereségek, kötvények jövedelme, osztalékok'),
  ('103.05', 'Hozzájárulás konferenciák és szeretetvendégségek szervezéséhez'),
  ('103.06', 'Iratterjesztés - bevétel'),
  ('103.07', 'Javak és részvények értékesítéséből'),
  ('103.08', 'Számlavisszatérítések'),
  ('103.09', 'Szponzortámogatások, adók 3,5 %-a'),
  ('104.01', 'Mezőgazdasági jövedelem'),
  ('104.02', 'Erdőgazdálkodási jövedelem'),
  ('104.03', 'Más gazdasági bevételek'),
  ('104.04', 'Épületek bérjövedelme'),
  ('104.05', 'Területek bérjövedelme'),
  ('105.01', 'Más egyházi intézményektől kapott támogatás'),
  ('105.02', 'Állami intézménytől kapott támogatás (APIA, stb.)'),
  ('105.03', 'Kongrua és járulékai'),
  ('106.01', 'Bevételek más egyházi intézmények részére'),
  ('106.02', 'Biztosítások - bevétel'),
  ('106.03', 'Missziói segélyek'),
  ('106.04', 'Bérjövedelmek 10%-a'),
  ('106.05', 'Bevételek egyházközségek részére'),
  ('106.06', 'Bevételek a felsőbb egyházi intézmények részére'),
  ('107.01', 'Kapott hitelek'),
  ('107.02', 'Visszakapott hitelek'),
  ('201.01', 'Fizetés alap'),
  ('201.02', 'Közköltségek (fűtés, világítás, víz stb.)'),
  ('201.03', 'Házbérek'),
  ('201.04', 'Épületadó, földadó biztosítás'),
  ('201.05', 'Szállítóeszközök üzemeltetési költségei'),
  ('201.06', 'Napidíj, utazási költségek'),
  ('201.07', 'Posta, telefon, internet'),
  ('201.08', 'Irodaszerek, nyomtatványok'),
  ('201.09', 'Fogyóanyagok, más anyagok'),
  ('201.10', 'Szolgáltatások költségei'),
  ('201.11', 'Protokoll'),
  ('201.12', 'Kis értékű leltári tárgyak beszerzése'),
  ('201.13', 'Karbantartási kiadások'),
  ('201.14', 'Más javadalmak'),
  ('201.15', 'Nettó fizetések'),
  ('201.16', 'Javadalmak utáni adó'),
  ('201.17', 'Társadalombiztosítás'),
  ('201.18', 'Egészségügyi biztosítás'),
  ('201.19', 'Munkabiztosítási hozzájárulás - 2,25%'),
  ('202.01', 'Gyerek és ifjúsági tevékenységek kiadásai'),
  ('202.02', 'Nőszövetségi tevékenységek kiadásai'),
  ('202.03', 'Presbiterszövetségi tevékenységek kiadásai'),
  ('202.04', 'Egyházközségek, vagy más egyházi intézmények támogatása'),
  ('202.05', 'Kiadások diakóniai célokra'),
  ('202.06', 'Missziós célú kiadások'),
  ('202.07', 'Teológiai hallgatók tanulmányi segélye - legátumok'),
  ('202.08', 'Egyháztagok segélyezése'),
  ('203.01', 'Szociális-kulturális tevékenységek támogatása'),
  ('203.02', 'Más kiadások'),
  ('203.03', 'Kezelési költségek, árfolyam veszteségek, kötvényeladási veszteségek'),
  ('203.04', 'Konferenciák és szeretetvendégségek költségei'),
  ('203.05', 'Iratterjesztés - kiadás'),
  ('203.06', 'Központi járulékok'),
  ('203.07', 'Bérjövedelmek 10%-a központi járulékba'),
  ('204.01', 'Mezőgazdasági kiadások'),
  ('204.02', 'Erdőgazdálkodási kiadások'),
  ('204.03', 'Más gazdasági kiadások'),
  ('204.04', 'Bérbeadott épületek javítása és karbantartása'),
  ('205.01', 'Új beruházások'),
  ('205.02', 'Általános javítások'),
  ('206.01', 'Kiadás más egyházi intézmény részére'),
  ('206.02', 'Biztosítások - kiadás'),
  ('206.03', 'Kifizetett missziói segélyek'),
  ('206.04', 'Kifizetett bérjövedelmek 10%-a'),
  ('206.05', 'Kiadások egyházközségek részére'),
  ('206.06', 'Kiadások a felsőbb egyházi intézmények részére'),
  ('207.01', 'Törlesztett hitelek'),
  ('207.02', 'Kiadott hitelek')
)
SELECT
  h.kod,
  h.hivatalos_nev,
  CASE WHEN h.kod LIKE '1%' THEN 'BEVETEL' ELSE 'KIADAS' END AS oldal,
  CASE
    WHEN s.id IS NULL THEN 'NINCS A SZAMADASICEL-BEN'
    WHEN s.szint IS NOT NULL AND s.szint <> 'gyulekezet' THEN 'ROSSZ SZINT: ' || s.szint
    WHEN h.kod LIKE '1%' AND b.id IS NULL THEN 'HIANYZIK A VALASZTEKBOL'
    WHEN h.kod LIKE '2%' AND k.id IS NULL THEN 'HIANYZIK A VALASZTEKBOL'
    WHEN h.kod LIKE '1%' AND b.aktiv = false THEN 'INAKTIV'
    WHEN h.kod LIKE '2%' AND k.aktiv = false THEN 'INAKTIV'
    ELSE 'RENDBEN'
  END AS allapot,
  s.nev AS rendszerbeli_nev
FROM hivatalos h
LEFT JOIN szamadasicel s ON s.id = h.kod
LEFT JOIN befizetescel b ON b.id_szamadasicel = h.kod
LEFT JOIN kiadascel    k ON k.id_szamadasicel = h.kod
ORDER BY
  CASE
    WHEN s.id IS NULL THEN 0
    WHEN s.szint IS NOT NULL AND s.szint <> 'gyulekezet' THEN 1
    WHEN (h.kod LIKE '1%' AND (b.id IS NULL OR b.aktiv = false))
      OR (h.kod LIKE '2%' AND (k.id IS NULL OR k.aktiv = false)) THEN 2
    ELSE 3
  END,
  h.kod;
