/**
 * Gyakori kérdések — a tagnyilvántartás és az anyakönyv EGYHÁZI SZABÁLYAI.
 *
 * 2026-09-05: a tagnyilvántartás + anyakönyv átvilágítás 38 kérdésére Endre
 * válaszolt; ez a fájl a válaszokat rögzíti úgy, ahogy a lelkipásztor olvassa.
 * A `valasz` a SZABÁLY (ami helyes), az `allapot` pedig őszintén megmondja,
 * hogy a szoftver ma követi-e:
 *   - 'kesz'       — a rendszer így működik;
 *   - 'reszben'    — részben, a megjegyzés mondja meg, mi hiányzik;
 *   - 'fejlesztes' — a szabály eldőlt, a rendszer igazítása folyamatban.
 *
 * A teljes döntési jegyzőkönyv (fejlesztői részletekkel):
 * docs/2026-09-05-anyakonyv-tagnyilvantartas-dontesek.md
 *
 * ⚠️ Szándékosan JSX-mentes, típus-törléssel futtatható modul: az őrszem
 * (scripts/selftest-tagnyilvantartas-gyik.mjs) VALÓDIAN betölti és a tartalmat
 * ellenőrzi, nem mintát grepel.
 */

export type GyikAllapot = 'kesz' | 'reszben' | 'fejlesztes'

export type GyikCsoportId = 'anyakonyv' | 'sorszam' | 'nev-kivonat' | 'tagnyilvantartas'

export interface GyikCsoport {
  id: GyikCsoportId
  cim: string
  bevezeto: string
}

export interface GyikTetel {
  /** A kérdés sorszáma az átvilágítás listájában (1–38) — hivatkozási kulcs. */
  sorszam: number
  csoport: GyikCsoportId
  kerdes: string
  /** A szabály, ahogy a lelkész olvassa. */
  valasz: string
  allapot: GyikAllapot
  /** Mi hiányzik még a szoftverből, vagy mire kell figyelni. */
  megjegyzes?: string
}

export const GYIK_ALLAPOT_FELIRAT: Record<GyikAllapot, string> = {
  kesz: 'Így működik',
  reszben: 'Részben kész',
  fejlesztes: 'Fejlesztés alatt',
}

export const GYIK_CSOPORTOK: GyikCsoport[] = [
  {
    id: 'anyakonyv',
    cim: 'Anyakönyv: lezárás, helyesbítés, érvénytelenítés',
    bevezeto: 'A bevezetett anyakönyvi bejegyzés okirat. Ezek a szabályok mondják meg, mi változhat rajta utólag, és ki teheti.',
  },
  {
    id: 'sorszam',
    cim: 'Egyházi sorszám',
    bevezeto: 'Az egyházi anyakönyvi szám (év, típuskód, folyószám) képzésének és védelmének szabályai.',
  },
  {
    id: 'nev-kivonat',
    cim: 'Nevek, kivonat, hiányos adatok',
    bevezeto: 'Mi kerül a bejegyzésbe és a kivonatra, és hogyan bánunk a részben ismert adattal.',
  },
  {
    id: 'tagnyilvantartas',
    cim: 'Tagnyilvántartás: azonosság, állapotok, család, költözés',
    bevezeto: 'A személyi karton, a családi karton és a gyülekezetváltás szabályai.',
  },
]

export const GYIK_TETELEK: GyikTetel[] = [
  // ── Anyakönyv: lezárás, helyesbítés, érvénytelenítés ─────────────────────
  {
    sorszam: 1,
    csoport: 'anyakonyv',
    kerdes: 'Módosítható-e utólag egy már bevezetett anyakönyvi bejegyzés?',
    valasz:
      'A bevezetett, sorszámozott bejegyzés lezárt okirat. A törzsadatait (személy, dátumok, számok, szolgáló lelkész) utólag nem írjuk át; helyesbítés csak széljegyzettel történik. A lezárást kizárólag egyházmegyei szinten lehet feloldani, és a feloldás ott dokumentálva marad: ki, mikor, miért.',
    allapot: 'fejlesztes',
    megjegyzes: 'Ma minden mező mindig szerkeszthető, lezárás-fogalom nincs. A lezárás és az egyházmegyei feloldás bevezetése folyamatban.',
  },
  {
    sorszam: 2,
    csoport: 'anyakonyv',
    kerdes: 'Hogyan kell helyesbíteni egy hibás bejegyzést?',
    valasz:
      'Külön, dátumozott széljegyzettel: a helyesbítő nevével és az indokkal, miközben az eredeti érték olvashatóan megmarad. A széljegyzet a bejegyzés alatt látszik a listában és a kivonaton is.',
    allapot: 'fejlesztes',
    megjegyzes: 'Ma a mentés felülírja az eredeti értéket; a széljegyzet-modell bevezetése folyamatban.',
  },
  {
    sorszam: 3,
    csoport: 'anyakonyv',
    kerdes: 'Törölhető-e egy tévesen rögzített anyakönyvi bejegyzés?',
    valasz:
      'Anyakönyvi bejegyzést nem törlünk. A tévesen rögzített bejegyzést érvénytelenítjük: a sor és a sorszáma megmarad, áthúzva, az érvénytelenítés okával, idejével és a lelkész nevével. Az érvénytelenített szám soha nem kerül más személyhez.',
    allapot: 'fejlesztes',
    megjegyzes: 'Ma a törlés végleges és a felszabaduló legmagasabb sorszámot a következő bejegyzés újra megkapja. Az érvénytelenítés bevezetése folyamatban.',
  },
  {
    sorszam: 4,
    csoport: 'anyakonyv',
    kerdes: 'Ki rögzíthet, szerkeszthet és érvényteleníthet anyakönyvi bejegyzést?',
    valasz:
      'Az egyházközségnél nyilvántartott egyházi alkalmazottak, akiknek a rendszergazda erre felhatalmazást adott. Egyházmegyei szintről csak a gyülekezet lelkészének engedélyével lehet módosítani.',
    allapot: 'fejlesztes',
    megjegyzes: 'Ma bárki írhat, akinek gyülekezeti hatóköre van, a pénzügyi szerepkörök is; az anyakönyvi felhatalmazás és az egyházmegyei engedély-kapu bevezetése folyamatban.',
  },
  {
    sorszam: 5,
    csoport: 'anyakonyv',
    kerdes: 'A be- és elköltözési, át- és kitérési könyv is „igazi” anyakönyv?',
    valasz:
      'Igen. A négy tagmozgási könyv ugyanolyan megőrzendő anyakönyv, mint a keresztelési, konfirmációi, házassági és temetési. Egyházi sorszámot kapnak, és a személy törlésével sem törölhetők.',
    allapot: 'fejlesztes',
    megjegyzes: 'Ma a tag végleges törlése a négy mozgási bejegyzést is törli; a védelem kiterjesztése folyamatban.',
  },
  {
    sorszam: 6,
    csoport: 'anyakonyv',
    kerdes: 'Mi történik a taggal, ha egy téves temetést vagy elköltözést érvénytelenítünk?',
    valasz:
      'A tag állapota automatikusan visszaáll: az elhunyt jelölés, a lezárt háztartás-tagság, a párkapcsolat és a választói kizárás is, feltéve, hogy a személyhez nem tartozik másik ilyen bejegyzés. A rendszer figyelmeztetésben mondja meg, mit állított vissza.',
    allapot: 'fejlesztes',
    megjegyzes: 'Ma az érvénytelenítés nem áll vissza semmit; a lelkész kézzel állítja helyre a státuszt.',
  },

  // ── Egyházi sorszám ───────────────────────────────────────────────────────
  {
    sorszam: 7,
    csoport: 'sorszam',
    kerdes: 'Hogyan képződik az egyházi anyakönyvi folyószám?',
    valasz:
      'Évenként és anyakönyv-típusonként újraindul. A folyószám a beírás sorrendjét követi, de mindig az esemény évének kötetében. Egy 2025. decemberi keresztelés 2026 januárjában rögzítve a 2025-ös kötet következő számát kapja.',
    allapot: 'fejlesztes',
    megjegyzes: 'Ma a rögzítő ablak a megnyitás évével kér számot, ezért a visszamenőleg rögzített esemény a folyó év sorába kerül. Javítás folyamatban.',
  },
  {
    sorszam: 8,
    csoport: 'sorszam',
    kerdes: 'Temetésnél a halál vagy a temetés napja számít az anyakönyvi évhez?',
    valasz:
      'A temetés napja adja az anyakönyvi évet és a sorszámot. Ha a halál az egyik évben, a temetés a következőben történt (például december 30-i haláleset, január 2-i temetés), a bejegyzés a temetés évének kötetébe kerül annak következő számával; a halálozás dátuma változatlanul az előző év marad a bejegyzésben. Az évszűrők és a listák is a temetés napja szerint sorolnak.',
    allapot: 'reszben',
    megjegyzes: 'A szám ma is a temetés évéből képződik, de a lista évszűrője a halál napját nézi; az összehangolás folyamatban.',
  },
  {
    sorszam: 9,
    csoport: 'sorszam',
    kerdes: 'Régi papír-anyakönyv átvételekor melyik szám a hivatalos?',
    valasz:
      'Régi bejegyzésnél a papír kötet száma a hivatalos egyházi szám, azt kell átvenni; a rendszer csak akkor képez számot, ha a fájlban nincs. Az „állami okirat” mező a polgári anyakönyvi kivonat száma. Az importfájl „Anyakönyvi szám” oszlopa a papír egyházi számot jelenti.',
    allapot: 'fejlesztes',
    megjegyzes: 'Ma az import az „Anyakönyvi szám” oszlopot az állami mezőbe teszi, és újraszámoz; javítás folyamatban.',
  },
  {
    sorszam: 10,
    csoport: 'sorszam',
    kerdes: 'Konfirmációnál egy alkalom egy számot kap, vagy minden konfirmandus külön?',
    valasz: 'Minden konfirmandus saját folyószámot kap.',
    allapot: 'kesz',
  },
  {
    sorszam: 11,
    csoport: 'sorszam',
    kerdes: 'Kap-e egyházi számot a Tagnyilvántartásból vagy az Iktatóból rögzített anyakönyvi esemény?',
    valasz:
      'Igen. Minden anyakönyvi bejegyzés egyházi sorszámot kap, akárhonnan rögzítik: a kivezetéskor rögzített temetés és elköltözés, a felvételkor rögzített keresztelés vagy beköltözés, az iktatói átadás és az asztali alkalmazás bejegyzése is.',
    allapot: 'fejlesztes',
    megjegyzes: 'Ma nyolc rögzítési út szám nélkül ír anyakönyvi sort; az egységesítés folyamatban.',
  },
  {
    sorszam: 12,
    csoport: 'sorszam',
    kerdes: 'Átírhatom az egyházi számot a rögzítő ablakban?',
    valasz:
      'Nem. Az egyházi számot a rendszer adja, a mező zárt. Javítani csak külön, naplózott „szám javítása” művelettel lehet.',
    allapot: 'fejlesztes',
    megjegyzes: 'Ma a mező szabadon írható és kiüríthető; a duplikált számot az adatbázis már elutasítja, a zárt mező bevezetése folyamatban.',
  },
  {
    sorszam: 13,
    csoport: 'sorszam',
    kerdes: 'Igazolás kiállítása közben keletkezhet-e „gyorsan bevezetett” anyakönyvi bejegyzés?',
    valasz:
      'Nem hiányosan. Igazolás kiállítása közben sem jöhet létre olyan keresztelési vagy házassági bejegyzés, amelyen csak dátum áll: a szolgáló lelkész és a helyszín ilyenkor is kötelező.',
    allapot: 'fejlesztes',
  },
  {
    sorszam: 14,
    csoport: 'sorszam',
    kerdes: 'Elég-e a négyjegyű folyószám?',
    valasz: 'Igen. Évente és típusonként 9999 bejegyzés bőven elég, a történeti átvételt is beleértve.',
    allapot: 'kesz',
  },

  // ── Nevek, kivonat, hiányos adatok ────────────────────────────────────────
  {
    sorszam: 15,
    csoport: 'nev-kivonat',
    kerdes: 'Melyik név szerepel az anyakönyvi bejegyzésen és a kivonaton: a bejegyzéskori vagy a mai?',
    valasz:
      'A bejegyzéskori név a hivatalos. Ha a tag neve később változik, a régi név megmarad a bejegyzésen és kereshető is. Házasságkötésnél mindkét név szerepel: a házassági és a leánykori, például „Szőcs Endréné Ungvári Rebeka”.',
    allapot: 'fejlesztes',
    megjegyzes: 'Ma a bejegyzés nem őriz nevet, a lista és a kivonat a tag mai nevét mutatja; a név-pillanatkép bevezetése folyamatban.',
  },
  {
    sorszam: 16,
    csoport: 'nev-kivonat',
    kerdes: 'Az emléklap és a hivatalos kivonat ugyanaz a nyomtatvány?',
    valasz:
      'Nem, két külön nyomtatvány. A díszes emléklap ajándék; a hivatalos kivonaton az egyházi szám, az állami szám, a hely, a keresztszülők vagy tanúk, az alapige, a szolgáló lelkész neve, a kiállítás napja, valamint az aláírás és a pecsét helye szerepel.',
    allapot: 'fejlesztes',
    megjegyzes: 'Ma csak az emléklap létezik; a hivatalos kivonat bevezetése folyamatban.',
  },
  {
    sorszam: 17,
    csoport: 'nev-kivonat',
    kerdes: 'Mit írjunk, ha egy dátumnak csak az éve ismert?',
    valasz:
      'A részlegességet jelöljük: a bejegyzés csak az évet vagy az évet és hónapot tartalmazza, pótolt nap nem jelenhet meg tényként sem a kivonaton, sem a kimutatásban. Kivezetésnél sem a mai nap és nem az „Ismeretlen” felekezet kerül az anyakönyvbe: ami nem ismert, üresen marad.',
    allapot: 'fejlesztes',
    megjegyzes: 'Ma az import és a kivezetés kitalált napot vagy „Ismeretlen” szót ír; javítás folyamatban.',
  },
  {
    sorszam: 18,
    csoport: 'nev-kivonat',
    kerdes: 'Férjezett asszonynál mit tároljunk a három névmezőben?',
    valasz:
      'Családnév: a jelenleg viselt családnév. Születési családnév: a leánykori. Férjezett név: a teljes házassági név, például „Kovács Jánosné”. Házasságkötéskor és halálesetkor a rendszer felajánlja a név és a családi állapot átvezetését, amit a lelkész hagy jóvá.',
    allapot: 'reszben',
    megjegyzes: 'A három mező létezik és így értelmezendő; a felajánlott átvezetés bevezetése folyamatban.',
  },
  {
    sorszam: 19,
    csoport: 'nev-kivonat',
    kerdes: 'Milyen formában áll az anya neve a keresztelői emléklapon és a gyermek kartonján?',
    valasz:
      'Az emléklapon a hagyományos forma, helyes toldalékkal (Kádár Zoltánné Tódor Enikő, Imréné, Csabáné). A gyermek kartonjára az anya tényleges neve kerül, nem a formázott alak.',
    allapot: 'fejlesztes',
    megjegyzes: 'Ma a toldalékolás nyers (Imrené), és a formázott alak kerül a kartonra is; javítás folyamatban.',
  },
  {
    sorszam: 20,
    csoport: 'nev-kivonat',
    kerdes: 'A hivatalos ív fiú/leány és férfi/nő rovatához mi az irányadó?',
    valasz: 'A tag rögzített neme, nem a keresztnévből következtetett. A név-heurisztika legfeljebb hiányzó nemnél tartalék.',
    allapot: 'fejlesztes',
  },
  {
    sorszam: 21,
    csoport: 'nev-kivonat',
    kerdes: 'A keresztszülők, tanúk és a szolgáló lelkész személyre hivatkozzanak, vagy szövegként álljanak?',
    valasz:
      'Szövegként állnak a hivatalos bejegyzésben, mert gyakran nem gyülekezeti tagok, és a bejegyzésnek önállóan is teljesnek kell lennie. Mellette opcionális személy-hivatkozás segítheti a családfát.',
    allapot: 'kesz',
  },
  {
    sorszam: 22,
    csoport: 'nev-kivonat',
    kerdes: 'Rögzíthető-e anyakönyvi esemény más gyülekezet tagjára?',
    valasz:
      'Nem közvetlenül. Anyakönyvi bejegyzés csak a saját nyilvántartásban szereplő személyre írható; a vendéget (például vegyes házasság menyasszonyát) előbb nem-tagként fel kell venni.',
    allapot: 'fejlesztes',
    megjegyzes: 'A kereső ma is csak saját tagot ad, de a szerver a tulajdonjogot nem ellenőrzi; az őr bevezetése folyamatban.',
  },

  // ── Tagnyilvántartás ──────────────────────────────────────────────────────
  {
    sorszam: 23,
    csoport: 'tagnyilvantartas',
    kerdes: 'Mi történik, ha két karton ugyanarról a személyről szól?',
    valasz:
      'A két rekordot összevonjuk: a régebbi marad, minden hivatkozás (anyakönyvi bejegyzés, család, háztartás, befizetés) átkerül rá, a másik „összevonva” jelöléssel elrejtve marad, és az összevonás visszavonható.',
    allapot: 'fejlesztes',
    megjegyzes: 'Összevonás-funkció ma nincs; addig a duplikátumot elrejteni lehet, ami az anyakönyvi bejegyzéseket a rossz kartonon hagyja.',
  },
  {
    sorszam: 24,
    csoport: 'tagnyilvantartas',
    kerdes: 'Mi van, ha ugyanaz a személy két gyülekezetben is szerepel?',
    valasz:
      'A két kartont közös azonosság-kapocs köti össze, a lélekszámban egyszer számít. A másik gyülekezet lelkésze csak a nevet és a gyülekezetet láthatja, hivatalos személyi számot soha.',
    allapot: 'fejlesztes',
  },
  {
    sorszam: 25,
    csoport: 'tagnyilvantartas',
    kerdes: 'Importnál mikor kötheti a rendszer magától az anyakönyvi bejegyzést egy taghoz?',
    valasz:
      'Csak születési dátum egyezésével vagy kézi megerősítéssel. A keresztnév és nem egyezése önmagában csak jelöltet adhat. Ha a talált személy rejtett, a rendszer a visszahozását ajánlja fel, nem hoz létre újat.',
    allapot: 'fejlesztes',
  },
  {
    sorszam: 26,
    csoport: 'tagnyilvantartas',
    kerdes: 'Mely tagsági állapot-váltások megengedettek?',
    valasz:
      'Aktívból bármely kivezetés. Elhunytból vissza csak naplózott visszavonással. Elköltözöttből beköltözéssel, kitértből áttéréssel lesz újra aktív. Elhunyt tagra elköltözés vagy kitérés nem rögzíthető. Törölt és aktív között csak elrejtés és visszahozás mozog.',
    allapot: 'fejlesztes',
    megjegyzes: 'Ma nincs átmenet-ellenőrzés; az asztali kartonon a státusz szabadon átírható.',
  },
  {
    sorszam: 27,
    csoport: 'tagnyilvantartas',
    kerdes: 'Az anyakönyvi Tagmozgás fülön rögzített esemény átállítja a tag státuszát?',
    valasz:
      'Igen. A mozgás-anyakönyv az elsődleges, a tag státusza belőle következik, ugyanúgy, mint a Kivezetés útján. Kitérésnél a vallás mező az eredeti marad, a célfelekezet a kitérési bejegyzésben áll.',
    allapot: 'fejlesztes',
  },
  {
    sorszam: 28,
    csoport: 'tagnyilvantartas',
    kerdes: 'Megjelenik-e az elköltözött vagy kitért tag a köszöntő listákon és a névsorokon?',
    valasz:
      'Nem: sem a születésnapos és névnapos listán, sem a körzet-névsoron. A családkartonon lezárt tagságként látszik. Az elhunyt a családkartonon kereszttel marad.',
    allapot: 'reszben',
    megjegyzes: 'Ma három lista három szabállyal szűr; az egységesítés folyamatban.',
  },
  {
    sorszam: 29,
    csoport: 'tagnyilvantartas',
    kerdes: 'Mit jelent a „más vallású” tagsági kategória?',
    valasz:
      'A gyülekezetben nyilvántartott, de nem református személyt, jellemzően a vegyes házasság nem református házastársát. Nem választó, nem járulékköteles, és nem kitért, mert nem volt református. Minden kizáró listának külön kategóriaként kell kezelnie.',
    allapot: 'fejlesztes',
  },
  {
    sorszam: 30,
    csoport: 'tagnyilvantartas',
    kerdes: 'Ki kerül a hivatalos választói névjegyzékre?',
    valasz:
      'Aki betöltötte a 18. évét, konfirmált, él, aktív tag, és az előző vagy az idei évre egyházfenntartói járulékot fizetett vagy felmentést kapott. A webes felületen véglegesített névjegyzék a hivatalos; az asztali alkalmazásból nyomtatott lista addig tájékoztató.',
    allapot: 'reszben',
    megjegyzes: 'A webes számítás és véglegesítés kész; az asztali alkalmazás még más alapsokaságból nyomtat.',
  },
  {
    sorszam: 31,
    csoport: 'tagnyilvantartas',
    kerdes: 'Hogyan kezeljük az újraházasodást, az özvegységet és a karton lezárását?',
    valasz:
      'Az új házasság új családi kartont kap, a régi lezárva megmarad. Egy személynek egyszerre csak egy aktív házastársi kapcsolata lehet. Halálesetkor a túlélő automatikusan özvegy jelölést kap, az elhunyt a kartonon marad. A korábbi gyermekek mellé kerülő új házastárs alapból mostohaszülő. A karton lezárása tudatos, megerősített művelet, az újranyitás is az.',
    allapot: 'fejlesztes',
  },
  {
    sorszam: 32,
    csoport: 'tagnyilvantartas',
    kerdes: 'Elköltözésnél és kitérésnél mi lesz a háztartás-tagsággal? Lehet egy család két gyülekezeté?',
    valasz:
      'Elköltözéskor a háztartás-tagság a költözés napjával záródik, a rokoni kapcsolat megmarad. Kitéréskor a háztartás együtt marad, csak az egyháztagság szűnik meg. A vegyes gyülekezetű család legitim: a kartont a családfő gyülekezete vezeti.',
    allapot: 'fejlesztes',
  },
  {
    sorszam: 33,
    csoport: 'tagnyilvantartas',
    kerdes: 'Hogyan zajlik az átjelentkezés másik gyülekezetbe?',
    valasz:
      'Az eredeti gyülekezet anyakönyvi bejegyzései névvel olvashatók és kivonatolhatók maradnak. A fogadó gyülekezetnél beköltözési bejegyzés keletkezik egyházi sorszámmal. Elutasításnál a küldő elköltözési bejegyzése érvénytelenítve marad megjegyzéssel, és a tag visszakerül aktívnak. Csak a fogadó gyülekezet lelkésze bírál el, iktatott elbocsátó levél alapján. Elfogadás előtt a fogadó csak a nevet, a születési évet és a küldő gyülekezetet látja.',
    allapot: 'fejlesztes',
    megjegyzes: 'Az elbírálás ma nem működik élesben, a függő kérelmek várnak; a folyamat újraépítése folyamatban.',
  },
  {
    sorszam: 34,
    csoport: 'tagnyilvantartas',
    kerdes: 'Mi történik, ha ketten egyszerre szerkesztik ugyanazt a tagot?',
    valasz:
      'A rendszer ütközést jelez mindkét felületen, és a lelkész mezőnként dönt, melyik érték maradjon. Csendben egyik mentés sem írja felül a másikat.',
    allapot: 'fejlesztes',
    megjegyzes: 'Ma a weben az utolsó mentés nyer jelzés nélkül; az asztali alkalmazás már ütközést jelez.',
  },
  {
    sorszam: 35,
    csoport: 'tagnyilvantartas',
    kerdes: 'Az asztali alkalmazásban felvehető-e tag személyi szám nélkül, és családhoz rendelhető-e offline?',
    valasz:
      'Igen mindkettő. A tag személyi szám nélkül is felvehető, a rendszer egyházi azonosítót ad, ugyanúgy, mint a weben. Az offline felvett tag azonnal családhoz rendelhető.',
    allapot: 'fejlesztes',
    megjegyzes: 'Ma az asztali űrlap valódi román személyi számot követel, és az offline felvett tag csak szinkron után sorolható családba.',
  },
  {
    sorszam: 36,
    csoport: 'tagnyilvantartas',
    kerdes: 'Mi lesz a gépen tárolt adatokkal, ha a lelkészt áthelyezik, és mi van közös irodai géppel?',
    valasz:
      'A régi gyülekezet adatai az első online kapcsolatnál törlődnek a gépről, türelmi idő nélkül. Közös Windows-fiókon a belépő kód a felhasználóhoz kötött, nem a géphez.',
    allapot: 'fejlesztes',
  },
  {
    sorszam: 37,
    csoport: 'tagnyilvantartas',
    kerdes: 'Hogyan kezeljük a lakcímet és a költözést?',
    valasz:
      'A nyilvántartás az aktuális címet vezeti, de a költözés dátuma és a régi cím megőrződik. A háztartás címe az elsődleges, a tagok azt öröklik, kivéve az ideiglenesen máshol lakót. Költözéskor a rendszer jelzi, ha a család már nem illik a körzetébe. Az üres házszám megengedett, a nyomtatvány „sz. n.”-t ír. Új települést a lelkész nem hoz létre önállóan: felülvizsgálatra kerül, a gyülekezet megyéjébe. Lakcímet és telefonszámot csak a lelkész és a gyülekezeti adminisztrátor lát, a könyvelő és a felettes szintek nem.',
    allapot: 'fejlesztes',
  },
  {
    sorszam: 38,
    csoport: 'tagnyilvantartas',
    kerdes: 'Gyülekezeti adattörlésnél mi történik a közös családokkal és a naplókkal?',
    valasz:
      'Az adattörlés nem törölheti a másik gyülekezettel közös családi kartont és a másik gyülekezet gyermek-sorait, csak a saját felet zárja le. A naplótáblák megmaradnak.',
    allapot: 'fejlesztes',
  },
]
