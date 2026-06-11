-- ============================================================================
-- KARTOTÉKA — Felsőbb szintű kategóriák jelölése (2026-06-11) · JAVÍTÓ szkript
--
-- MIT CSINÁL (egyszerűen): a 19 kategóriát, amely Endre két képernyőképe
-- alapján IGAZOLTAN nem egyházközségi (hanem egyházmegyei/felsőbb szintű),
-- „egyházmegyei" szintűnek jelöli a rendszerben. Ettől:
--   - a gyülekezeti rögzítő választékából automatikusan eltűnnek (a bevételi
--     lista pontosan 30 tételes lesz, mint a hivatalos Excelben),
--   - az egyházmegyei felületeken viszont pont ezek lesznek elérhetők.
-- A már rögzített tételeket NEM érinti, semmit nem töröl.
--
-- FORRÁS: a hivatalos Adatok_2026.xlsx egyházközségi legördülő-listái
-- (bevétel: 30 tétel · kiadás: 38 tétel — Endre képei, 2026-06-11).
--
-- HOGYAN FUTTASD: Supabase → SQL Editor → az EGÉSZET illeszd be → Run →
-- a végén megjelenő táblázatot másold vissza (ellenőrzésül).
-- ============================================================================

-- 1) A 19 felsőbb szintű kód jelölése (csak ha eddig nem volt jelölve)
UPDATE szamadasicel
   SET szint = 'egyhazmegye'
 WHERE id IN (
   -- bevételi oldal (9): a hivatalos egyházközségi listán NEM szereplők
   '101.07', -- Központi járulékok - egyházmegyei bevétel
   '101.08', -- Egyházközségek fizetésalapja - emei bevétel
   '105.03', -- Kongrua és járulékai
   '106.01', '106.02', '106.03', '106.04', '106.05', '106.06',
   -- kiadási oldal (10): a hivatalos egyházközségi listán NEM szereplők
   '201.15', -- Nettó fizetések
   '201.16', -- Javadalmak utáni adó
   '201.17', -- Társadalombiztosítás
   '201.18', -- Egészségügyi biztosítás
   '201.19', -- Munkabiztosítási hozzájárulás - 2,25%
   '206.02', '206.03', '206.04', '206.05', '206.06'
 )
   AND (szint IS NULL OR szint = 'gyulekezet');

-- 2) Ellenőrző táblázat — ez jelenik meg eredményként.
--    A "valasztekban_volt" oszlop mutatja meg, melyik volt eddig (tévesen)
--    felvéve a gyülekezeti rögzítőbe — ez volt a bevételi „+1".
SELECT s.id AS kod,
       s.nev,
       s.szint,
       CASE WHEN b.id IS NOT NULL AND b.aktiv = true THEN 'IGEN — ez volt a +1!'
            WHEN k.id IS NOT NULL AND k.aktiv = true THEN 'IGEN — ez volt a többlet!'
            ELSE 'nem' END AS valasztekban_volt
  FROM szamadasicel s
  LEFT JOIN befizetescel b ON b.id_szamadasicel = s.id
  LEFT JOIN kiadascel    k ON k.id_szamadasicel = s.id
 WHERE s.id IN ('101.07','101.08','105.03','106.01','106.02','106.03','106.04','106.05','106.06',
                '201.15','201.16','201.17','201.18','201.19',
                '206.02','206.03','206.04','206.05','206.06')
 ORDER BY s.id;
