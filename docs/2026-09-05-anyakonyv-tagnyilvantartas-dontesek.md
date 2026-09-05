# Anyakönyv és tagnyilvántartás: a helyes viselkedés döntései (2026-09-05)

**Forrás:** a 2026-09-02..05-i teljes körű átvilágítás 38 kérdésére Endre válaszolt
2026-09-05-én. Az 1–19. kérdésre szó szerint, a 20–38.-ra „minden további
feltételezésed helyes" formában (a feltételezések itt döntésként állnak).
**Státusz:** ez a jegyzőkönyv a kanonikus szabálykészlet. A javítási kör ebből
indul; a lelkészi olvasat a Tagnyilvántartás súgójának Gyakori kérdések rovata
(`apps/web/components/members/tagnyilvantartas-gyik-adatok.ts`).
**Jelentés:** https://claude.ai/code/artifact/f6e65e52-7c3a-4208-a897-1bb6534a458e

A „Ma" oszlop a 2026-09-05-i élő állapotot mondja (a jelentés találat-azonosítóival).

## A) Anyakönyv: lezárás, helyesbítés, érvénytelenítés

| # | Döntés | Ma | Érintett találatok |
|---|---|---|---|
| 1 | A bevezetett, sorszámozott bejegyzés **lezárt okirat**. Törzsadata utólag nem írható át. A lezárást **csak egyházmegyei szinten** lehet feloldani, és a feloldás **ott dokumentálva** marad (ki, mikor, miért). | Nincs lezárás-fogalom; minden mező mindig írható. | AM-06, AM-13, TT-01 |
| 2 | Helyesbítés **külön, dátumozott széljegyzettel**: helyesbítő neve, indok, az eredeti érték olvashatóan megmarad. Listában és kivonaton a bejegyzés alatt látszik. | Felülírás; sor-szintű audit van (09-04 óta), széljegyzet nincs. | AM-01 (lezárva), ASZ-01 |
| 3 | **Nincs fizikai törlés.** Téves bejegyzés → érvénytelenítés (storno): sor és sorszám marad, áthúzva, ok + idő + lelkész. Az érvénytelenített szám soha nem kerül más személyhez. („Ahogy jónak látod" → ez a választott modell.) | Hard DELETE egy natív confirm után; a felszabaduló max szám újra kiosztódik. | AM-02, TT-06, TT-01 |
| 4 | Anyakönyvet **az egyházközségnél nyilvántartott egyházi alkalmazottak** írhatnak, akiknek **a rendszergazda felhatalmazást adott**. **Egyházmegyei szintről csak a lelkész engedélyével** módosíthatnak. | Bárki ír, akinek gyülekezeti hatóköre van (pénzügyi szerepek is); megyei engedély-kapu nincs. | AV-01, TI-06, AM-11, TT-08, AV-02 |
| 5 | A **4 tagmozgási könyv** (be-/elköltözött, át-/kitért) **ugyanolyan megőrzendő anyakönyv**, mint a 4 fő; számot kap, a személy törlésével sem törölhető. | A tag-törlő RPC fizikailag törli őket. | TT-05, ASZ-03, TS-11, AM-10 |
| 6 | Téves temetés/elköltözés érvénytelenítésekor a tag állapota **automatikusan visszaáll** (elhunyt-jelölés, háztartás-tagság, párkapcsolat, választói kizárás), ha nincs másik ilyen bejegyzése; figyelmeztetéssel. | Semmi nem áll vissza; a 09-04-i trigger-javítás tudatosan kézi visszaállítást választott — **ezt a döntés felülírja**. | ASZ-06, TS-04, TT-12, AM-07 |

## B) Egyházi sorszám

| # | Döntés | Ma | Érintett találatok |
|---|---|---|---|
| 7 | Évenként és típusonként újrainduló; a folyószám **a beírás sorrendje, de az esemény évének kötetében**. 2025. decemberi keresztelés 2026 januári rögzítése → 2025-ös kötet következő száma. | A dialógus a megnyitás évével kér számot. | SZ-03, HK-03, SZ-02 |
| 8 | **A temetés napja** adja az évet és a sorszámot. **Év-határ eset külön kezelendő**: december 30-i haláleset, január 2-i temetés → a temetés évének kötete, a halál dátuma változatlan; listák, évszűrők a temetés napja szerint. | A szám a temetés évéből, a lista évszűrője a halál napjából. | SZ-12, Q-TEMETES-EV |
| 9 | Régi papír-anyakönyvnél **a papír szám a hivatalos egyházi szám**, átveendő; generálás csak, ha nincs. **Az okirat = polgári anyakönyvi kivonat száma.** Az import „Anyakönyvi szám" oszlopa a papír egyházi szám. | Az import az állami mezőbe teszi, és újraszámoz. | IMP-04, SZ-13, HK-16 |
| 10 | Konfirmációnál **egyénenként** külön szám. | Így működik. | SZ-04 |
| 11 | **Minden** anyakönyvi bejegyzés kap egyházi számot, bármely rögzítési útról (kivezetés, tagfelvétel, iktató átadás, desktop). | 8 út szám nélkül ír. | AM-08, SZ-09, WD-10 |
| 12 | Az egyházi szám **zárt mező**; javítás csak külön, naplózott „szám javítása" művelettel. | Szabadon írható és kiüríthető (dupla már nem, a 09-04-i index miatt). | AM-03, SZ-07 |
| 13 | Igazolás kiállítása közben **nem** keletkezhet csak-dátumos bejegyzés; lelkész és hely kötelező. | Keletkezhet. | AM-14 |
| 14 | A 4 jegyű sorszám **elég**. | — | SZ-15 |

## C) Nevek, kivonat, hiányos adatok

| # | Döntés | Ma | Érintett találatok |
|---|---|---|---|
| 15 | **A bejegyzéskori név a hivatalos**; névváltozásnál a régi név megőrzendő és kereshető. **Házasságkötésnél mindkét név szerepel: „Szőcs Endréné Ungvári Rebeka".** | Nincs név-pillanatkép; minden lista/kivonat a mai nevet mutatja. | ASZ-01, NEV-05 |
| 16 | **Két nyomtatvány**: emléklap + hivatalos kivonat (egyházi szám, állami szám, hely, keresztszülők/tanúk, alapige, lelkész, kiállítás napja, aláírás/pecsét helye). | Csak emléklap. | HK-12, HK-21 |
| 17 | **A részlegesség jelölendő**, pótolt nap nem jelenhet meg tényként; kivezetésnél nem „mai nap"/„Ismeretlen". | Import és kivezetés kitalált napot/„Ismeretlen"-t ír. | HK-01, HK-02, HK-05, HK-07, IMP-14 |
| 18 | Családnév = viselt; születési családnév = leánykori; férjezett név = **teljes házassági név** („Kovács Jánosné"). Házasságkötéskor/halálesetkor **átvezetés felajánlva, jóváhagyással**. | Mezők vannak; átvezetés nincs. | NEV-02, NEV-03, NEV-04 |
| 19 | Emléklapon a hagyományos „-né" forma **helyes toldalékkal**; a **kartonra az anya tényleges neve**. | Naiv toldalék, formázott alak a kartonon. | NEV-13, ASZ-10 |
| 20 | Hivatalos F/N bontáshoz **a rögzített nem** az irányadó. | Név-heurisztika. | NEV-01, ASZ-19 |
| 21 | Keresztszülő, tanú, lelkész: **szöveges mező marad**, opcionális személy-hivatkozással mellette. | Szöveg (rendben). | — |
| 22 | **Nincs vendég-eset**: anyakönyvi bejegyzés csak saját nyilvántartott személyre; a vendég előbb nem-tagként felveendő. A szerver ellenőrizze a tulajdonjogot. | Nincs szerveroldali őr. | F1 (tenant-web), ASZ-07 |

## D) Tagnyilvántartás

| # | Döntés | Ma | Érintett találatok |
|---|---|---|---|
| 23 | Összevonás: **a régebbi marad**, minden hivatkozás átíródik, a forrás „összevonva" jelöléssel elrejtve, **visszavonhatóan**. | Nincs funkció. | ID-05, ASZ-16 |
| 24 | Két gyülekezet: **azonosság-kapocs**; a másik lelkész csak nevet + gyülekezetet lát, **hivatalos személyi számot soha**. | A kereszt-egyeztető a belső azonosítót kiadja. | ID-01, AV-03 |
| 25 | Import: kötés csak **születési dátum-egyezéssel vagy kézi megerősítéssel**; rejtett személynél visszahozás felajánlva. | „Utolsó esély" keresztnév+nem alapján köt. | IMP-01, NEV-03, IMP-05 |
| 26 | Állapotgép: aktív → bármely kivezetés; elhunyt → csak naplózott visszavonás; elköltözött → beköltözéssel aktív; kitért → áttéréssel aktív; elhunyt után nincs elköltözés; törölt ↔ aktív csak elrejtés/visszahozás. | Nincs átmenet-ellenőrzés; desktopon szabad select. | TS-02, ASZ-13, TS-07 |
| 27 | A **Tagmozgás fül az elsődleges**, a státusz belőle következik; **kitérésnél a vallás marad**, a célfelekezet a kitérési sorban. | saveMovement nem ír státuszt; a kivezetés felülírja a vallást. | TS-02, TS-21, ASZ-17 |
| 28 | Elköltözött/kitért: nem köszöntendő, körzet-névsorban nem szerepel, kartonon lezárt tagságként; elhunyt † jellel marad. | Három lista három szabály. | TS-14, TS-19 |
| 29 | **„Más vallású" külön kategória** (nem református házastárs): nem választó, nem járulékköteles, nem kitért; minden kizáró listának ismernie kell. | A web nem ismeri az értéket. | WD-05, TS-08 |
| 30 | Választói névjegyzék: 18+, konfirmált, élő, aktív ÉS előző/idei évre fizetett vagy felmentett; **a webes véglegesítés a hivatalos**, a desktop nyomtatvány addig nem hivatalos. | Web kész; desktop más alapsokaság. | WD-06, WD-13 |
| 31 | Új házasság = **új karton**, a régi lezárva; **egy aktív házastársi kapcsolat**; halálesetkor **automatikus özvegy-jelölés**, az elhunyt a kartonon marad; új házastárs a korábbi gyermekek mellé **alapból mostohaszülő**; karton lezárása/újranyitása **tudatos, megerősített** művelet. | Felnőtt-hely nem szabadul fel; özvegység nem íródik; RPC minden mentésnél újraaktivál. | CSK-15, CS-01, CS-10, CS-05 |
| 32 | Elköltözéskor a **háztartás-tagság záródik** (rokonság marad); kitéréskor a háztartás marad. **Vegyes gyülekezetű család legitim**, a családfő gyülekezete vezeti. | Csak halál zár; 4 különböző hatókör-szabály. | CS-11, TS-19, CSK-03 |
| 33 | Átjelentkezés: az eredeti gyülekezet bejegyzései névvel olvashatók maradnak; fogadónál **beköltözési sor sorszámmal**; elutasításnál az elköltözési sor **érvénytelenítve marad megjegyzéssel**, a tag aktív; **csak a fogadó lelkész** bírál el, **iktatott elbocsátó levéllel**; elfogadás előtt **csak név + születési év + küldő gyülekezet** látható. | A respond RPC élesben nem létezik; 12 pending; a tervezett elfogadás átírná a congregation_id-t. | GYV-01, GYV-03, GYV-09, ASZ-02, AV-11 |
| 34 | Egyidejű szerkesztés: **ütközés-jelzés mindkét felületen**, mezőnkénti lelkészi döntés. | Web: utolsó nyer; desktop: jelez. | AM-06, WD-03, TD-03 |
| 35 | Desktop: **személyi szám nélküli tag felvehető** generált azonosítóval; **offline felvett tag családhoz rendelhető**. | Kötelező 13 jegyű CNP; családba csak szinkron után. | WD-01, WD-02, TD-… |
| 36 | Áthelyezett/kilépett lelkész gépéről az adatok **az első online kapcsolatnál törlődnek**; **közös Windows-fiók van**, a PIN **felhasználóhoz kötendő**. | Gépszintű PIN; nincs státusz-ellenőrzés a tükörnél. | TD-01, TD-02 |
| 37 | Cím: aktuális cím a hivatalos, **költözés dátuma + régi cím megőrzendő**; **háztartás címe az elsődleges**, tagok öröklik; költözéskor **körzet-eltérés jelzése**; **üres házszám megengedett** („sz. n."); településtörzs bővítése **felülvizsgálattal**, a gyülekezet megyéjébe; lakcím/telefon **csak lelkész + gyülekezeti admin**. | In-place felülírás; „1" default; countyid=1; sor-szintű RLS. | CIM-01…CIM-05, CIM-09, CIM-10, CIM-12 |
| 38 | Gyülekezeti adattörlés **nem** törli a vegyes családok közös kartonját és a másik gyülekezet gyermek-sorait; **a naplótáblák megmaradnak**. | OR-feltételes törlés; naplók is törlődnek. | TT-06/TT-07 (wipe) |

## Következmények a javítási sorrendre (javaslat, még nem jóváhagyott)

1. **Anyakönyv okirat-modell** (1–3, 6, 12): lezárás + egyházmegyei feloldás dokumentálva; széljegyzet-tábla; érvénytelenítés törlés helyett (a DELETE-ág megszűnik); zárt szám-mező; érvénytelenítéskor automatikus státusz-visszaállítás.
2. **Sorszám-egységesítés** (7, 8, 11): év = esemény éve minden úton; a 8 szám nélküli írási út a közös generálón át; temetés év-határ eset; lista évszűrő = temetés napja.
3. **Név-pillanatkép és kivonat** (15, 16, 18, 19, 20): a bejegyzés hordozza a bejegyzéskori neveket (házasságnál kettős név); hivatalos kivonat nyomtatvány; F/N a nem mezőből.
4. **Tenant- és szerep-kapuk** (4, 22, 24): id_szemely tulajdon-ellenőrzés minden anyakönyvi írásnál; anyakönyvi felhatalmazás a szerepkörben; megyei írás csak lelkészi engedéllyel; a can_access olvasó ága kikerül az írás/törlés policy-kból.
5. **Átjelentkezés újraépítése** (33) és **állapotgép** (26–29).
6. **Család-modell** (31, 32), **cím** (37), **desktop-paritás** (34–36), **import-szigor** (9, 17, 25), **wipe** (38).
