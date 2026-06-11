-- 2026-06-11f — szamadasicel NÉV-FIX diff-riport (READ-ONLY)
-- A hivatalos EREK Excel 2026-os katalógusa (Adatok_2026.xlsx › Hibak!fif, C:D:E)
-- vs a Kartotéka szamadasicel táblája. A user: „Az exel nevek a helyesek" → ezekhez
-- kell igazítani a Kartotéka neveit. EZ CSAK MEGMUTATJA az eltéréseket — nem ír.
-- (A nevek whitespace-normalizálva: beágyazott sortörések szóközzé.)
--
-- Kategória-szám: 87 levél (101-107 bevétel + 201-207 kiadás).

WITH excel(kod, nev_hu, nev_ro) AS (
  VALUES
    ('101.01','Egyházfenntartói járulék','Contr. anuală a credincioşilor'),
    ('101.02','Bevételek a különböző egyházi szolgálatokért','Contribuţii pt. diverse servicii religioase'),
    ('101.03','Perselypénz','Contribuţii în lăcaşuri de cult - colecta'),
    ('101.04','Adományok hívektől, egyházi intézményektől','Ajutoare primite de la credincioşi şi organizaţii religioase'),
    ('101.05','Úrasztali adományok','Donații pt. masa domnului'),
    ('101.06','Sírhelyek eladásából, bérleti díjából, gondozásából származó bevételek','Cont. pt. concesionarea şi îngrijirea locurilor din cimitire'),
    ('101.07','Központi járulékok - egyházmegyei bevétel','Contribuţia pt. susţinerea unit. Ierarhic superioare'),
    ('101.08','Egyházközségek fizetésalapja - emei bevétel','Contr. pt. prestări servicii la parohii'),
    ('102.01','Gyerek és ifjúsági tevékenységek bevételei','Venituri cu scop misionar - tineret'),
    ('102.02','Nőszövetségi tevékenységek bevételei','Venituri cu scop misionar - asoc. femeilor crestine'),
    ('102.03','Presbiterszövetségi tevékenységek bevételei','Venituri cu scop misionar - asoc. presbiterilor'),
    ('102.04','Diakóniai célú adományok','Donaţii pt. scopuri diaconice'),
    ('102.05','Missziós célú adományok','Donatii pt. scopuri misionare'),
    ('102.06','Legátumok - adományok teológiai hallgatók támogatására','Donatii pt. studenti de la teologie'),
    ('103.01','Segélyszervezetektől, alapítványoktól, helyi szervezetektől származó adományok','Alte donaţii'),
    ('103.02','Pályázatokból','Incasări proiecte'),
    ('103.03','Más bevételek','Din alte surse'),
    ('103.04','Banki kamatok, árfolyam nyereségek, kötvények jövedelme, osztalékok','Dobândă bancară, diferentă curs valutar, venituri din dividende si obligatiuni'),
    ('103.05','Hozzájárulás konferenciák és szeretetvendégségek szervezéséhez','Pt. participare la conferinţe'),
    ('103.06','Iratterjesztés - bevétel','Distribuirea tipăriturilor'),
    ('103.07','Javak és részvények értékesítéséből','Din valorificarea unor bunuri si vânzare unori actiuni'),
    ('103.08','Számlavisszatérítések','Rambursări'),
    ('103.09','Szponzortámogatások, adók 3,5 %-a','Din sponsorizări'),
    ('104.01','Mezőgazdasági jövedelem','Activităţi agricole'),
    ('104.02','Erdőgazdálkodási jövedelem','Activităţi silvice'),
    ('104.03','Más gazdasági bevételek','Alte venituri din activităţi anexe'),
    ('104.04','Épületek bérjövedelme','Venit din închirierea clădirilor'),
    ('104.05','Területek bérjövedelme','Venit din închirierea terenurilor'),
    ('105.01','Más egyházi intézményektől kapott támogatás','De la unităţi din cadrul cultului'),
    ('105.02','Állami intézménytől kapott támogatás (APIA, stb.)','Subvenţii de la stat'),
    ('105.03','Kongrua és járulékai','Subvenţii primite pt. Salarii'),
    ('106.01','Bevételek más egyházi intézmények részére','Alte încasări'),
    ('106.02','Biztosítások - bevétel','Asigurari'),
    ('106.03','Missziói segélyek','Pt. fond misionar'),
    ('106.04','Bérjövedelmek 10%-a','Cota 10% din chirii'),
    ('106.05','Bevételek egyházközségek részére','Încasări pt. Parohii'),
    ('106.06','Bevételek a felsőbb egyházi intézmények részére','Încasări pt. unităţi ierarhice superioare'),
    ('107.01','Kapott hitelek','Credite primite'),
    ('107.02','Visszakapott hitelek','Restituiri din credite'),
    ('201.01','Fizetés alap','Contr. pt. prestări servicii efectuate către protopopiat'),
    ('201.02','Közköltségek (fűtés, világítás, víz stb.)','Cheltuieli de întreţinere (încălzire iluminat apă etc.)'),
    ('201.03','Házbérek','Chirii'),
    ('201.04','Épületadó, földadó biztosítás','Impozite, taxe, şi asigurări ADAS'),
    ('201.05','Szállítóeszközök üzemeltetési költségei','Mijloace de transport'),
    ('201.06','Napidíj, utazási költségek','Diurnă, cheltuieli de deplasare'),
    ('201.07','Posta, telefon, internet','Poştă, telefon, internet'),
    ('201.08','Irodaszerek, nyomtatványok','Articole de birotică și papetărie'),
    ('201.09','Fogyóanyagok, más anyagok','Alte materiale'),
    ('201.10','Szolgáltatások költségei','Prestări şi servicii'),
    ('201.11','Protokoll','Protocol'),
    ('201.12','Kis értékű leltári tárgyak beszerzése','Obiecte de inventar (de mică valoare, scurtă durată)'),
    ('201.13','Karbantartási kiadások','Reparaţii curente'),
    ('201.14','Más javadalmak','Alte drepturi de retribuţie'),
    ('201.15','Nettó fizetések','Salarii nete'),
    ('201.16','Javadalmak utáni adó','Impozit asupra drepturilor de retribuire'),
    ('201.17','Társadalombiztosítás','Contribuţii pt. asigurări sociale'),
    ('201.18','Egészségügyi biztosítás','C.A.S.S.'),
    ('201.19','Munkabiztosítási hozzájárulás - 2,25%','Contribuția asiguratorie pt. muncă - 2,25%'),
    ('202.01','Gyerek és ifjúsági tevékenységek kiadásai','Cheltuieli cu scop misionar - tineret'),
    ('202.02','Nőszövetségi tevékenységek kiadásai','Cheltuieli cu scop misionar - asoc. femeilor crestine'),
    ('202.03','Presbiterszövetségi tevékenységek kiadásai','Cheltuieli cu scop misionar - asoc. Presbiterilor'),
    ('202.04','Egyházközségek, vagy más egyházi intézmények támogatása','Plăti pt. alte parohii'),
    ('202.05','Kiadások diakóniai célokra','Cheltuieli pt. scopuri diaconice'),
    ('202.06','Missziós célú kiadások','Cheltuieli pt. scopuri misionare'),
    ('202.07','Teológiai hallgatók tanulmányi segélye - legátumok','Ajutoare pt. studentii de la teologie'),
    ('202.08','Egyháztagok segélyezése','Ajutoare acordate credincioşilor'),
    ('203.01','Szociális-kulturális tevékenységek támogatása','Sprijinirea unor acţiuni social culturale'),
    ('203.02','Más kiadások','Alte cheltuieli'),
    ('203.03','Kezelési költségek, árfolyam veszteségek, kötvényeladási veszteségek','Comisioane, pierderi curs valutar, pierderi din vânzari certificate si obligatiuni'),
    ('203.04','Konferenciák és szeretetvendégségek költségei','Cheltuieli pt. Conferinţe'),
    ('203.05','Iratterjesztés - kiadás','Distribuirea tipăriturilor'),
    ('203.06','Központi járulékok','Contribuţii pt. susţinerea unităţii ierarhic superioare'),
    ('203.07','Bérjövedelmek 10%-a központi járulékba','Contribuţia centrală 10% din chirii'),
    ('204.01','Mezőgazdasági kiadások','Activităţi agricole'),
    ('204.02','Erdőgazdálkodási kiadások','Activităţi silvice'),
    ('204.03','Más gazdasági kiadások','Alte cheltuieli din activităţi anexe'),
    ('204.04','Bérbeadott épületek javítása és karbantartása','Întreţinerea spaţiilor locative sau cu alte destinaţii închiriate'),
    ('205.01','Új beruházások','Investiţii noi'),
    ('205.02','Általános javítások','Reparaţii capitale'),
    ('206.01','Kiadás más egyházi intézmény részére','Alte plăţi'),
    ('206.02','Biztosítások - kiadás','Asigurari'),
    ('206.03','Kifizetett missziói segélyek','Plăţi pt. fd. misionar'),
    ('206.04','Kifizetett bérjövedelmek 10%-a','Cota 10% din chirii'),
    ('206.05','Kiadások egyházközségek részére','Plăţi pt. parohii'),
    ('206.06','Kiadások a felsőbb egyházi intézmények részére','Plăţi pt. unităţi ierarhice superioare'),
    ('207.01','Törlesztett hitelek','Rambursări de credite'),
    ('207.02','Kiadott hitelek','Acordări de credite')
)
SELECT
  COALESCE(e.kod, s.id)  AS kod,
  s.nev                  AS kartoteka_nev,
  e.nev_hu               AS excel_nev,
  s.nevro                AS kartoteka_nevro,
  e.nev_ro               AS excel_nevro,
  CASE
    WHEN s.id IS NULL  THEN '1_HIANYZIK_A_KARTOTEKABOL'
    WHEN e.kod IS NULL THEN '2_NINCS_EXCEL_KATALOGUSBAN'
    WHEN s.nev IS DISTINCT FROM e.nev_hu
      OR s.nevro IS DISTINCT FROM e.nev_ro THEN '3_NEV_ELTER'
    ELSE '4_OK'
  END                    AS statusz,
  s.aktiv
FROM excel e
FULL JOIN public.szamadasicel s ON s.id = e.kod
WHERE s.id IS NULL
   OR (e.kod IS NULL AND s.id ~ '^(10[1-7]|20[1-7])[.]')
   OR s.nev   IS DISTINCT FROM e.nev_hu
   OR s.nevro IS DISTINCT FROM e.nev_ro
ORDER BY statusz, kod;
