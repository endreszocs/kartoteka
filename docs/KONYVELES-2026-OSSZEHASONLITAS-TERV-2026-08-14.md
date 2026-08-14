# Könyvelés 2026 ⇄ Kartotéka — teljes állapotfelmérés és tervdokumentum

**Készült:** 2026-08-14 · a `C:\Users\endre\Downloads\Konyveles_2026_a` mappa mind a 14 fájljának
gépi kivonatolása után, 11 párhuzamos elemző ágenssel, a kódbázissal tételesen összevetve.
**Jelleg:** KIZÁRÓLAG állapotfelmérés — a kódhoz nem nyúltunk.

**A vizsgált hivatalos csomag:** Adatok_2026.xlsx · Kimutatasok_2026.xlsx · Anyagraktarkonyv.xlsx ·
Dispozitie de plata_2026.xlsx · Elszamolas_2026.xlsx · Iktato.xlsx · Lelkeszi jelentes.xlsx ·
Munkanaplo_Lelkeszi jelentes.xlsx · Sugo.pdf · Valtozasok 2026.pdf · Utmutato az EREK szamadasahoz.pdf ·
Penzugyi vizsgalat.pdf · extras de cont.pdf · 14_Egyhazi-adminisztracio-az-EREK-ben.pdf

## Mérleg

| | |
|---|---|
| Vizsgált terület | **11** |
| Talált eltérés összesen | **164** |
| ⛔ Blokkoló | **18** |
| 🔴 Súlyos | **53** |
| Ellenőrző SQL (read-only) | **97** — külön fájlban: `migration-docs/sql/2026-08-14-konyveles-2026-ellenorzesek.sql` |

**Az ellenőrző SQL-ekben hivatkozott mind a 27 tábla létezését visszaellenőriztem a repó sémájában;
mindegyik SELECT tiszta read-only (0 DDL/DML).** Az eredményeket visszaküldve tudjuk elválasztani,
mi tényleges adathiba az élesben, és mi „csak" kód-hiányosság.

## A tíz legfontosabb megállapítás (vezetői összefoglaló)

1. ⛔ **A Főkönyv (Registru Jurnal) — az egyetlen KÖTELEZŐEN bekötendő nyomtatvány — ma nem
   állítható elő szabályosan**: nincs 40 soros lapokra tördelés, nincs folytatólagos lapszám
   (bedrótozott „pg. 1"), és minden banki tételre „Chit."-et ír.
2. ⛔ **A 2026-os készpénz-korlátok közül EGY SINCS kikényszerítve** (50 000 kassza-plafon ·
   1 000 decont-előleg · 5 000/cég/nap · 10 000/nap összesen · feldarabolás-tilalom ·
   10 000 magánszemély). Ráadásul a rendszer saját súgója KÉT ELLENTMONDÓ előleg-küszöböt ír
   (1 000 és 5 000). Strukturális gát: a tétel-rögzítő nem gyűjt CUI-t/partner-típust.
3. ⛔ **A Számadás záró blokkja hiányos**: nincs Casa/Banca bontás, és teljesen hiányzik a
   Tartozások (116–128. sor) + Kintlévőségek blokk a 134. Záróegyenleggel — a hivatalos
   „1. számú hibajelzés" (záró ⇄ kassza+bank egyenleg egyezése) sincs implementálva.
4. ⛔ **A nyomtatott Nr. rând 69 soron eltér a hivatalostól** — a lelkészi jelentés VIII.
   fejezetének mindhárom hivatkozott sora (66., 97., 98.) ROSSZ számot kapna.
5. ⛔ **A lelkészi jelentés két hivatalos változata (egyszerű ⇄ munkanaplós) 64 cellában tér el**,
   és munkanapló nélkül 18 rubrika NÉMÁN 0-t kap úgy, hogy kézzel nem is írható felül.
6. ⛔ **Az iktató EREK-importja az ügykört a legacy mezőbe teszi** — az irat besorolatlan ÉS
   nem szerkeszthető marad; az offline/Excel/desktop út eldobja az ügykör-kódot.
7. ⛔ **Az anyagraktárban nincs dátumra vetített készlet** (a vagyonleltár 12.31. helyett a MAI
   állapotot mutatná), és a Vagyonleltári jelentésből hiányzik a kötelező „Anyag raktári
   készletek" sor; a stornó némán mínuszba fordíthatja a készletet.
8. ⛔ **A véglegesített Költségvetés/Számadás borítójáról némán lemarad a presbitériumi
   határozat és az iktatószám** — a leltár-véglegesítés determinisztikus oszlopai pedig holtak.
9. 🔴 **Nincs HAVI zárás** — a hivatalos rend szerint a hónapot a kinyomtatott havi
   kasszakönyvvel kell lezárni; nálunk a lefűzött hónap sorai utólag is szerkeszthetők.
10. 🔴 **A nyomtatott regiszterekből kimarad a Megjegyzés (altétel-bontás), és a rögzített
    irattípus felülíródik** (minden készpénzes sor „Chit.", minden banki „Extr"/„OP") —
    a regiszter ellentmond a lefűzött bizonylatnak.

## Javasolt megvalósítási csomagok (a jóváhagyás UTÁN)

| Csomag | Tartalom | Miért ez a sorrend |
|---|---|---|
| **K1 — Regiszterek szabályossá tétele** | Főkönyv 40 soros lapozás + folytatólagos lapszám; Registru Casă/Bancă lapozás + TOTAL PAGINA; kísérőív 20 soros lapozás + évi futó kiadás-sorszám; Megjegyzés + valódi irattípus a regisztereken; kísérőív desktopra | A bekötendő KÖTELEZŐ nyomtatvány ma szabálytalan — vizsgálaton bukik |
| **K2 — Számadás-szerkezet** | Tartozások/Kintlévőségek blokk (116–134. sor); Nr. rând igazítás a hivatalos 69 sorhoz; Casa/Banca záró bontás; 1. sz. hibajelzés; borító határozat+iktatószám | A lelkészi jelentés VII–VIII. fejezete erre épül |
| **K3 — Készpénz-korlátok** | mind a 7 korlát élő ellenőrzése (először figyelmeztetésként); CUI/partner-típus mező; súgó-ellentmondás javítása; decont-előleg 1 000 lej | Törvényi megfelelés; a döntés-függő 207.02-kérdés aug. 17-én |
| **K4 — Havi zárás** | havi zárolás-állapot + a lezárt hónap védelme + feloldás naplózva | A papír ⇄ rendszer széthúzás megszüntetése |
| **K5 — Iktató ügykörjegyzék** | a 2024-es ügykörjegyzék felvétele; import-javítás; iratgyűjtőn belüli sorszám | Az iratrendezés hivatalos rendje |
| **K6 — Anyagraktár** | as-of készlet; Bevételezési bizonylat + kiadási utalvány; Leltárív; partner-mezők; storno-őr | A vagyonleltár hitelessége |
| **K7 — Lelkészi jelentés kettőssége** | az egyszerű űrlap módja (auto→kézi esés, ha nincs munkanapló); a 64 cellás eltérés-katalógus beépítése | A 18. ponttal (EREK-spec) együtt szállítandó |
| **K8 — Vizsgálat-felkészítő** | „Pénzügyi vizsgálat" nézet: a 41 ellenőrzési tétel státusza + egy gombbal az összes nyomtatvány | A többi csomag elkészülte UTÁN ér a legtöbbet |

⚠️ **Ami a csomagokból is kimarad (tudatosan, külön döntést igényel):** HR/alkalmazotti modul
(8 vizsgálati tétel), ingatlan-nyilvántartás (telekkönyv + Rezident/Nerezident), bérleti 10% adó,
segélyszállítmány NIR — ezek ÚJ MODULOK, nem javítások.

---

# Részletes megállapítások területenként


---

## 1. Pénzügyi vizsgálat — az egyházmegyei/kerületi ellenőrzés szempontrendszere (Penzugyi_vizsgalat.pdf) leképezve a Kartoteka pénzügy + leltár + iktató + jegyzőkönyv moduljaira

A hivatalos szempontrendszer (Penzugyi_vizsgalat.txt, 97 sor) négy blokkban 41 bemutatandó iratot sorol fel: Pénzügyvitel (18 tétel, 8–40. sor), Leltár (12 tétel, 44–70. sor), Egyházi alkalmazottak (8 tétel, 73–81. sor), Segélyszállítmányok (6 tétel, 85–96. sor). A Kartoteka pénzügyi nyomtatási központja (packages/ui-app/src/finance/reporting.ts FINANCE_PRINT_TYPES + BUDGET_PRINT_TYPES) 12 nyomtatványt ad: Registru Casa, Registru Banca, Registrul-Jurnal, Csoportnapló, Nyugtatömb kimutatás, Kiadási kísérőív, Decont- és Dispozitie-újranyomtatás, Költségvetés, Költségvetés-módosítás, Számadás, Részszámadás. A leltár modul öt továbbit (apps/web/lib/inventory/reporting.ts: Leltárív, Registru inventar, Aktív-passzív, Törölt tárgyak, Vagyonleltári jelentés) plusz a tárgyankénti fisát, az iktató kettőt (iktatópecsét, 9 rovatos iktatókönyv), az anyagraktár egyet. Ezzel a Pénzügyvitel-blokk gerince (kasszakönyv, banknapló, főkönyv, csoportnapló, kísérőív, nyugtatömb) papírral lefedett, és a "Teljes év" opció (FinancePrintDialogBody.tsx:504) teljesíti a Változások 2026 Jan_Dec követelményét. A 41 tételből viszont 22-höz a rendszer ma egyáltalán nem tud papírt adni: hiányzik a teljes alkalmazotti blokk (8/8), a NIR/bon consum, az Extras de cont, az ingatlan-nyilvántartás (telekkönyv + Rezident/Nerezident/Mixt), a pályázat/hitel/egyesület követés, a szórvány-összesítő, a pecsétnyomó-nyilvántartás és az irattári leltár. Két néma, ellenőrzött eltérés a legsúlyosabb: (1) a véglegesített költségvetés/számadás borítójára a presbitériumi határozat száma-dátuma és az egyházközségi iktatószám SOHA nem kerül ki, mert a BudgetPrintData.iktatoszam/hatarozatSzam/hatarozatDatum mezőket egyetlen hívó sem tölti ki, viszont a finalized=true elnémítja a "Nincs véglegesítve" figyelmeztetést is — a lelkész üres, de hibátlannak látszó borítót visz a vizsgálatra; (2) a 2026-os készpénzszabályok (50 000 / 10 000 / 5 000 / 1 000 lej) sehol nincsenek ellenőrizve a kódban. A Súgó-fül checklistje (FinanceSugoChecklist.tsx) létezik, de a napi/havi/negyedéves/évvégi teendőket követi, nem a vizsgálati listát — "Pénzügyi vizsgálat felkészítő" nézet vagy egygombos csomag ma nincs.

### Eltérések

#### ⛔ BLOKKOLÓ — A véglegesített Költségvetés/Számadás borítójáról NÉMÁN lemarad a presbitériumi határozat és az egyházközségi iktatószám

**Hivatalos:** Penzugyi_vizsgalat.txt 9-17. sor: "Költségvetés - a hozzá tartozó presbiteri határozattal (presbiteri jegyzőkönyv), az esperesi hivatal iktatószámával, az esperes és a számvevő aláírásával"; ugyanez a Költségvetés kiegészítésre (11-13. sor) és a Számadásra (14-17. sor).

**Kartotéka ma:** packages/ui-app/src/finance/budget-reporting.ts:187-189 deklarálja az iktatoszam/hatarozatSzam/hatarozatDatum mezőket, a buildCoverPage (556-610. sor) ki is rajzolja őket. DE: sem apps/web/components/finance/finance-print-dialog.tsx, sem apps/web/components/finance/budget-print-dialog.tsx nem adja át egyiket sem (grep iktatoszam|hatarozatSzam|hatarozatDatum e két fájlban = 0 találat), miközben a finalized-et igen (finance-print-dialog.tsx:286, budget-print-dialog.tsx:145-155). A DB-ben ott az adat: bealitas.presbiteriumi_hatarozat_szam / _datum / egyhazkozsegi_iktatoszam / szamadas_hatarozat_szam, és a véglegesítés írja is (penzugy/actions.ts:3304).

**Következmény:** Véglegesítés után a borítón üresen marad a "Tárgyalta és jóváhagyta a presbitérium a ___ tartott gyűlésén ___ szám alatt" és az "Egyházközségi iktatószám: ___" sor, ráadásul a finalized=true elnyomja a figyelmeztetést is (budget-reporting.ts:591). A lelkész hibátlannak látszó, de a szempontrendszer 2-4. pontját NEM teljesítő papírt visz a vizsgálatra; a számvevő ezt az első lapon visszadobja.

#### ⛔ BLOKKOLÓ — A 2026-os készpénzhasználati korlátok (50 000 / 10 000 / 5 000 / 1 000 lej) sehol nincsenek ellenőrizve

**Hivatalos:** Valtozasok_2026.txt 37-61. sor: pénztárban max 50 000 lej (többlet 3 napon belül bankba); egy nap összesen max 10 000 lej készpénz cégeknek, egyetlen cégnek sem több 5 000-nél; 5 000 lej feletti számla csak 5 000-ig készpénzzel; a kifizetés FELDARABOLÁSA TILOS; decont-előleg max 1 000 lej/nap/személy; magánszemélytől/magánszemélynek max 10 000 lej/nap.

**Kartotéka ma:** A teljes pénzügyi magban (apps/web/lib/finance, packages/ui-app/src/finance, apps/web/app/(dashboard)/penzugy) nincs egyetlen 50000/10000/5000/1000 lej küszöb sem. A számadás-véglegesítő 9 ellenőrzése (penzugy/finalization-actions.ts key mezők: bank_nyito, fx_revaluation, befizetes_category, kiadas_category, befizetes_person, oblio_unentered, diocese_info) egyiket sem fedi le. A decont tábla tárolja a kapott_eloleg oszlopot (migration-docs/sql/2026-06-06-decont-dispozitie-sorszam.sql:83), de plafon-ellenőrzés nélkül.

**Következmény:** A vizsgálaton a kinyomtatott kasszakönyvből percek alatt kiderül a túllépés, és ez törvényi (bírságolható) szabály, nem belső előírás. A Kartoteka ma sem rögzítéskor, sem zárás előtt nem szól — a lelkész a hibát csak a számvevőtől tudja meg.

#### ⛔ BLOKKOLÓ — A leltár véglegesítése nem rögzít presbiteri határozatot / iktatószámot — az oszlopok LÉTEZNEK, de holtak

**Hivatalos:** Penzugyi_vizsgalat.txt 46-49. sor: "Az évenkénti leltározások alkalmával készített jegyzőkönyv, amiben fel vannak tüntetve a leírásra javasolt leltári tárgyak - a hozzá tartozó presbiteri határozattal (presbiteri jegyzőkönyv)" + "Évenkénti vagyon leltárjelentés".

**Kartotéka ma:** bealitas.leltar_iktatoszam / leltar_hatarozat_szam / leltar_hatarozat_datum oszlopok léteznek (migration-docs/Database_schema.sql 117-119. sor), de a teljes repóban EGYETLEN olvasó vagy író sincs rájuk (grep = 0 találat .ts/.tsx-ben). A finalizeLeltar() csak leltar_finalized: true-t ír (apps/web/app/(dashboard)/leltar/actions.ts:398-411), és a vagyonleltári jelentés builder (apps/web/lib/inventory/reporting.ts buildVagyonReport) sem tartalmaz iktatószám- vagy határozat-mezőt.

**Következmény:** A véglegesített vagyonleltári jelentésen nincs sem iktatószám, sem presbiteri határozat — a Leltár-blokk 3. és 4. pontja bizonyíthatatlan. A pénzügyi oldal (költségvetés/számadás) legalább tárolja ezeket; a leltár oldalán a séma ott van, a lánc nincs bekötve.

#### 🔴 SÚLYOS — A Leltárívről (Lista de inventariere) hiányzik a Leltározó bizottság 3 tagú aláírás-blokkja és az Átadó/Átvevő rész

**Hivatalos:** Anyagraktarkonyv.txt, 'Leltar_iv' lap (1041-1108. sor): B4='LISTA DE INVENTARIERE', C59='Comisia de inventariere / Leltározó bizottság', B60='Numele si prenumele / Név 1___' + D60='2___ 3___', B61='Semnatura / Aláírás 1___' + D61='2___ 3___', H59='Átadó*', I59='Átvevő*'. A Penzugyi_vizsgalat.txt 45. sora ezt az ívet kéri.

**Kartotéka ma:** apps/web/lib/inventory/reporting.ts buildLeltarivReport (370-430. sor): a fejléc oszlopai lefedik a hivatalos formát (Nr. crt., Denumirea bunurilor inventariate, Cod, U.M., Cant., Pret u. contabil, Val. contabila), de a lap alja csak a page-footer (gyülekezetnév + oldalszám). A signature-grid CSS létezik a fájlban (340-342. sor) és a vagyonleltári jelentés használja is (731-742. sor: Lelkipásztor / Gondnok / harmadik), de a Leltárív nem hívja.

**Következmény:** A leltárív aláíratlanul kerül a vizsgálatra. Egy aláírás nélküli Lista de inventariere nem bizonyíték: nem derül ki, ki leltározott, és átadás-átvétel esetén nincs átadó/átvevő. A számvevő ezt kifogásolja.

#### 🔴 SÚLYOS — Az egyházi alkalmazottakra vonatkozó teljes blokk (8/8 tétel) hiányzik — nincs HR modul

**Hivatalos:** Penzugyi_vizsgalat.txt 72-81. sor: díjlevelek + munkaszerződések + fizetésre vonatkozó presbiteri határozatok; lakásszerződések + presbiteri határozatok; más javakra (telefon, villany, gépkocsi, kert) vonatkozó szerződések; munkaköri leírások; jelenléti naplók; szabadságok betervezése (ki nem vett szabadság következő év március 31-ig); fizetésjegyzékek másolata; személyi iratgyűjtő.

**Kartotéka ma:** A repóban nincs kód egyikre sem: grep -ril munkaszerzodes|dijlevel|jelenleti|fizetesjegyzek|munkakori .ts/.tsx/.sql = 0 találat; a 'szabadsag' egyetlen találata egy congregations-seed SQL. Nincs employees/alkalmazottak tábla a 100 táblás sémában (migration-docs/Database_schema.sql). Az iktato_csatolmany (migration-docs/sql/2026-07-17-f6-iktato-csomok-csatolmanyok.sql:152) alkalmas lenne szkennelt szerződések tárolására, de nincs rá dedikált nyilvántartás.

**Következmény:** A vizsgálat egyik teljes fejezetéhez (8 tétel) a Kartoteka semmit nem ad — a lelkész papíralapú dossziéból dolgozik. Ez a legnagyobb egybefüggő fehér folt.

#### 🔴 SÚLYOS — Extras de cont (év végi követelés-elismertetés) — nincs nyomtatvány

**Hivatalos:** Penzugyi_vizsgalat.txt 67-68. sor: "Év végi követelésekre (be nem érkezett épület-, föld-, terem bérek) az ügyfelektől vissza kapott, aláírt elismerési bizonylatok (Extras de cont confirmat)". A teljes űrlapot az extras_de_cont.txt tartalmazza: Unitate / Cod fiscal / Sediul / Judetul / Cont / Banca / Nr inreg + "Confirmam prezentul extras de cont pentru suma de ... Lei" + 5 napos visszaküldési határidő + két aláírás (Conducatorul unitatii, Conducatorul compartimentului financiar contabil) + L.S.

**Kartotéka ma:** A 12 pénzügyi nyomtatványtípus (FINANCE_PRINT_TYPES + BUDGET_PRINT_TYPES) között nincs ilyen. A berleti_szerzodes tábla tárolja a szerződéseket (osszeg, fizetesi_ciklus, kezdet, vege, aktiv — Database_schema.sql 1052-1082), de a packages/ui-app/src/finance/DebtTab.tsx nem tartalmaz print-utat (grep print|nyomtat = 0 találat a fájlban), és a tartozás-lekérdezés a járulékra, nem a bérleti követelésre épül.

**Következmény:** A be nem érkezett bérleti díjakra nem lehet elismerő bizonylatot kiküldeni a rendszerből. Az év végi követelés-állomány így alá nem támasztott a számadásban.

#### 🔴 SÚLYOS — A bérbe adott ingatlanok 10%-os adója nincs kezelve

**Hivatalos:** Penzugyi_vizsgalat.txt 63-64. sor: "A bérbe adott ingatlanok bérleti szerződése, beiktatva az Esperesi Hivatalban. Épületek bérjövedelme után a 10% befizetését igazoló okmányok."

**Kartotéka ma:** A berleti_szerzodes tábla (Database_schema.sql 1052-1082) tárolja az összeget, a fizetési ciklust és a jogi típust (locatiune/arendare/comodat/concesiune), de a packages/ui-app/src/finance/RentalTab.tsx és rental-calculation.ts fájlokban nincs 10%-os adószámítás (grep 10%|0.10|impozit = 0 találat), és nincs mező/nyilvántartás a befizetés igazolására. Az esperesi hivatali beiktatás sem köthető: nincs iktato-hivatkozás a berleti_szerzodes-ben.

**Következmény:** A vizsgálat a bérjövedelem 10%-ának befizetését kéri számon; a rendszer sem az adót nem számolja, sem a befizetés bizonylatát nem tartja nyilván.

#### 🔴 SÚLYOS — Ingatlan-nyilvántartás nincs: telekkönyvi kivonat és az adóhivatali Rezident/Nerezident/Mixt besorolás sehol

**Hivatalos:** Penzugyi_vizsgalat.txt 54-62. és 65. sor: telekkönyvi kivonatok (szerepelnek-e az épületek); az épületekről/telkekről/erdőről a helyi adóhivatalhoz letett nyilatkozatok másolata, bejelölve melyik kultikus / lakó / gazdasági tevékenységű / vegyes (Rezident/Nerezident/Mixt); a területeknél: bérbe adott / temető / kultikus telek / gazdasági. Hivatkozás: COD FISCAL Lg 227/08.sept.2015 art. 456.d, valamint 10/2001, 94/2000, 83/1999 törvények.

**Kartotéka ma:** A 'telekkonyvi_szam' oszlop EGYETLEN helyen létezik: berleti_szerzodes.telekkonyvi_szam (Database_schema.sql 1067) — tehát csak a BÉRBE ADOTT ingatlanra. A leltar_tetelek táblában (Database_schema.sql 958-995) nincs telekkönyvi szám, nincs kultikus/lakó/gazdasági/vegyes besorolás, nincs adóhivatali nyilatkozat-hivatkozás. Az INVENTORY_CATEGORIES (lib/constants/inventory.next.ts) sem tartalmaz ilyen dimenziót.

**Következmény:** A Leltár-blokk 7-8. és 11. pontjához nincs adat. Ráadásul az adókedvezmény (kultikus épületek, visszaszolgáltatott műemlékek) igényléséhez szükséges besorolás sincs sehol rögzítve — ez pénzben mérhető veszteség.

#### 🔴 SÚLYOS — Segélyszállítmányok: hiányzik a NIR (Nota de intrare-receptie) és a bon de consum

**Hivatalos:** Penzugyi_vizsgalat.txt 85-96. sor, hat elem: adománylevél iktatva; presbiteri határozat a kiosztásáról; raktárbavételi jegyzék (Nota de intrare-receptie); fogyasztási jegyzék (bon consum); adománylevél a kiosztott segélyekről, amely tartalmazza a személyazonossági adatokat is és a kiosztott mennyiségeket; anyagraktárkönyvi nyilvántartás vagy leltári szám, ha marad.

**Kartotéka ma:** Az anyagraktár (materials + material_movements, migration-docs/sql/2026-04-18-anyagraktar.sql) rögzíti a 'bevetel'/'kiadas' mozgásokat, és az anyagraktárkönyv nyomtatvány (apps/web/lib/finance/anyagraktar-print.ts) hűen követi a hivatalos Anyagraktar_iv lapot (Készítette/Ellenőrizte, S.sz/Kelte/Irat száma/Magyarázat/Mennyiség/Érték). DE: grep -i "nota de intrare|bon_consum|bon de consum|NIR" a .ts/.tsx/.sql fájlokban = 0 találat, és a material_movements-ben nincs személyazonossági adat a kiosztott segélyekhez.

**Következmény:** A hatból két hivatalos román bizonylat (NIR, bon consum) és a névre szóló adománylevél nem állítható elő. Segélyakciónál a vizsgálat ezeket kéri először.

#### 🔴 SÚLYOS — Nincs típus a gazdasági bizottság félévi ellenőrzési jegyzőkönyvéhez és a leltározási jegyzőkönyvhöz

**Hivatalos:** Penzugyi_vizsgalat.txt 18. sor: "A gazdasági bizottság félévenkénti pénzügyi ellenőrzésének jegyzőkönyvei." + 46-48. sor: "Az évenkénti leltározások alkalmával készített jegyzőkönyv, amiben fel vannak tüntetve a leírásra javasolt leltári tárgyak - a hozzá tartozó presbiteri határozattal".

**Kartotéka ma:** A presbiteri_jegyzokonyvek.tipus csak két értéket ismer: 'presbiteri' | 'kozgyulesi' (apps/web/app/(dashboard)/jegyzokonyvek/actions.ts:82 és 279; a tábla defaultja 'presbiteri', Database_schema.sql 1453). A részszámadás nyomtatvány I./II. félév gyorsgombbal megvan (FinancePrintDialogBody.tsx periodPresets), a leltár 'torolt_targyak' nyomtatvány szintén — de egyik sem jegyzőkönyv-alakú, és nincs hozzájuk köthető határozat.

**Következmény:** A félévi gazdasági ellenőrzés és a leltározás papírja csak külső Word-ben készül el; a Kartoteka jegyzőkönyv-modulja nem tudja fogadni, így a határozat-hivatkozás sem jön létre.

#### 🔴 SÚLYOS — Az előző pénzügyi ellenőrzés jegyzőkönyve és a meghagyások teljesítéséről szóló jelentés — nincs tároló

**Hivatalos:** Penzugyi_vizsgalat.txt 8. sor — a lista LEGELSŐ pontja: "Az előző pénzügyi ellenőrzés jegyzőkönyve; a meghagyások teljesítéséről szóló jelentés."

**Kartotéka ma:** Nincs dedikált tábla vagy nézet. Az iktato + iktato_csatolmany + iratcsomo (migration-docs/sql/2026-07-17-f6-iktato-csomok-csatolmanyok.sql:47 és 152) alkalmas a szkennelt jegyzőkönyv iktatására, de nincs meghagyás-nyilvántartás (meghagyás szövege, felelős, határidő, teljesítve igen/nem), és nincs 'előző vizsgálat' entitás.

**Következmény:** A vizsgálat a saját korábbi meghagyásainak teljesítésével kezdődik. A lelkész ma nem tud a rendszerből kimutatást adni arról, mit írtak elő és mi teljesült — ez rögtön az első pontnál hiányossághoz vezet.

#### 🔴 SÚLYOS — Nincs Pénzügyi vizsgálat felkészítő nézet — a 41 tétel kézzel gyűjtendő össze

**Hivatalos:** Penzugyi_vizsgalat.txt teljes egésze (1-97. sor): négy blokk, 41 bemutatandó irat, Ungvári Éva aláírásával.

**Kartotéka ma:** A legközelebbi meglévő felület a packages/ui-app/src/finance/FinanceSugoChecklist.tsx: napi/heti (3 tétel), havi (5), negyedéves (3), év végi (9) teendők. Ez a KÖNYVELÉSI ritmust követi, nem a vizsgálati listát — pl. nincs benne kísérőív-lefűzés, nyugtatömb-anyagraktárkönyv, banki iratgyűjtő, comodat, alkalmazotti iratok, pecsétnyomó, levéltározás. A nyomtatványok három külön dialógusban élnek (finance-print-dialog.tsx, inventory-print-dialog-v2.tsx, iktato-print.tsx), egygombos csomagolás nincs.

**Következmény:** A vizsgálat előtti este a lelkész 3 külön felületről, típusonként külön-külön nyomtat 15-20 dokumentumot, és semmi nem mondja meg neki, mi maradt ki. Ez a modul legnagyobb hozzáadott-érték-lehetősége.

#### 🟠 KÖZEPES — Irattári leltár (levéltározás) — az adat megvan, a nyomtatvány nincs

**Hivatalos:** Penzugyi_vizsgalat.txt 70. sor: "Levéltározás". A hivatalos Iktato.xlsx külön 'Irattari_leltar' lapot tartalmaz (Iktato.txt): oszlopai A10='S.sz.', B10='Ikt.sz.', C10='Dátum', D10='Küldő/Címzett', E10='Tárgy', F10='Lapszám'; iratgyűjtőnként (G2 lenyíló: pl. 'Levelezés'), 300 sor/lap, folyamatos lapszám-tartománnyal (J11 képlet: 'kezdő-záró').

**Kartotéka ma:** Az iktato tábla tárolja a szükséges mezőket: irattarijel, oldalszam, file_folder, kelt, sender_or_recipient, subject (Database_schema.sql 776-806), és a UI szerkeszti is (apps/web/components/filing/filing-main.tsx:168). DE az apps/web/components/filing/iktato-print.tsx csak két nyomtatványt exportál: printIktatoPecset (82. sor) és printIktatokonyv (117. sor, 9 rovatos). Irattári leltár nincs.

**Következmény:** Az adatlánc kész, csak a nyomtatvány hiányzik — ez a lista legolcsóbban pótolható tétele. Ma a lelkész az irattári leltárt kézzel vezeti, holott a rendszer ki tudná adni.

#### 🟠 KÖZEPES — A nyugtatömbök nem kerülnek bele az Anyagraktárkönyv nyomtatványba

**Hivatalos:** Penzugyi_vizsgalat.txt 21-26. sor: "Nyugtatömbök (Chitanta) ... csak az EREK iratterjesztőjéből vásárolt sorszámozott nyugta használható" + "Nyugtatömbök anyagraktárkönyve" + "Számlatömbök (Factura)" + "Számlatömbök anyagraktárkönyve".

**Kartotéka ma:** apps/web/components/inventory/material-warehouse-tab.tsx handlePrintAll (150-182. sor) kizárólag a filteredMaterials-t adja át a buildAnyagraktarkonyvHtml-nek — a chitanta_tombok csak a KÉPERNYŐN jelenik meg külön szekcióban. Ezt a migration-docs/sql/2026-04-18-anyagraktar.sql fejléce tudatos döntésként rögzíti ("A kerületi NYUGTATÖMBÖK KÜLÖN rendszerben maradnak"). Külön van rá a 'nyugtatomb_kimutatas' nyomtatvány (reporting.ts:84-88). Számlatömb (Factura) fizikai tömbnyilvántartás egyáltalán nincs: grep factura_tomb|szamlatomb = 0 találat; a Factura csak az Oblio e-számla integráción keresztül létezik (oblio_szamlak tábla).

**Következmény:** A vizsgálaton a Nyugtatömb kimutatás bemutatható, de nem az a nyomtatvány, amit a lista kér (anyagraktárkönyvi lap). Ha az egyházközség papíralapú számlatömböt használ, arra és annak anyagraktárkönyvére semmi nincs.

#### 🟠 KÖZEPES — Benzinelszámolás: Contract de comodat (gépkocsira) és Ordin de deplasare (kiszállási lap) nincs

**Hivatalos:** Penzugyi_vizsgalat.txt 33-35. sor: "Benzinköltség elszámolása esetén, ha a gépkocsi nem az egyházközség tulajdona, szükséges az ingyen használati szerződés (Contract de comodat) a gépkocsira, vagy a kiszállási lap (Ordin de deplasare)".

**Kartotéka ma:** A 'comodat' szó a kódban egyetlen helyen szerepel: a berleti_szerzodes.jogi_tipus CHECK-jében (Database_schema.sql 1078) — ez a gyülekezet által KIADOTT ingatlan jogcíme, nem a gépkocsira KAPOTT ingyenes használat. Az 'ordin_de_deplasare' és 'kiszallasi' kifejezésekre 0 kódtalálat.

**Következmény:** Üzemanyag-elszámolásnál a kísérőívhez tartozó alapbizonylat nem áll elő a rendszerből, pedig a benzin tipikusan minden gyülekezet kiadásai közt szerepel.

#### 🟠 KÖZEPES — Pályázatok elszámolása, hitelek követése, egyesületek-alapítványok éves beszámolója — mind hiányzik

**Hivatalos:** Penzugyi_vizsgalat.txt 38-40. sor: "Pályázatok elszámolása", "Hitelek követése", "Egyházi egyesületek, alapítványok éves beszámolója". Kapcsolódik: Valtozasok_2026.txt 40-41. sor — "Tilos az egyházközség számára készpénzben kölcsönt adni, csak bankszámlán lehetséges a kölcsönzés és a visszafizetés is".

**Kartotéka ma:** grep -ril palyazat|kolcson .ts/.tsx/.sql = 0 találat; a 'hitel' találatok mind 'hitelesítés'/'hitelesito' (pl. presbiteri_jegyzokonyvek.hitelesito1). Nincs pályázat-, hitel- vagy kapcsolt-szervezet tábla a sémában.

**Következmény:** Pályázatot futtató vagy hitellel rendelkező gyülekezetnél a vizsgálat három pontjához külön Excel kell. A készpénzes kölcsön tilalmát sem tudja a rendszer kikényszeríteni.

#### 🟠 KÖZEPES — Szórvány / leányegyházközség / nőszövetség / presbiteri szövetség számadás-összesítő nincs

**Hivatalos:** Penzugyi_vizsgalat.txt 36-37. sor: "Számadások összesítője ahol van szórvány vagy leányegyházközség, ha a nőszövetség és presbiteri szövetség külön vezeti a könyvelést".

**Kartotéka ma:** grep -ril szorvany|leanyegyhaz|filia .ts/.tsx/.sql = 0 kódtalálat (a noszovetseg találatok mind programtípus-címkék: lib/constants/dashboard.ts:45, lelkeszi-jelentes III.17). A modell egy congregation = egy számadás; a congregations táblában nincs anya-leány kapcsolat.

**Következmény:** Szórványos gyülekezetnél az összesítőt kézzel kell készíteni, és a részek számadása nem köthető össze a rendszerben.

#### 🟠 KÖZEPES — A havi kasszakönyv-nyomtatás megtörténtének nincs nyoma

**Hivatalos:** Valtozasok_2026.txt 21-24. sor: "A naponkénti kasszakönyvi lapot nem kell kinyomtatni, csak a havonkéntit ... Hónap végén ki kell nyomtatni egy példányban a havi kasszakönyvet, és azzal zárjuk le a hónapot." Penzugyi_vizsgalat.txt 19-20. sor: "Kasszakönyv havonként nyomtatva, a kiadási kísérőíveket, esetenként a bevételi iratokat lefűzve. Segélyezések esetében a presbiteri határozatokat is be kell mutatni."

**Kartotéka ma:** A Registru Casa nyomtatvány megvan (reporting.ts FINANCE_PRINT_TYPES 'registru_casa'), a Súgó-checklist 'havi-3' tétele emlékeztet rá (FinanceSugoChecklist.tsx:96-101), de a checklist csak kliensoldali jelölő — nincs tábla, ami rögzítené, melyik hónap kasszakönyve lett kinyomtatva, és nincs figyelmeztetés a hónap zárásakor.

**Következmény:** 12 hónapból egy kimaradt nyomtatás csak a vizsgálaton derül ki, amikor az iratgyűjtőből hiányzik a lap. Utólag pótolható, de a hónapzárás dátumbélyege már nem hiteles.

#### 🟠 KÖZEPES — A segélyezési kiadásokhoz nem köthető presbiteri határozat

**Hivatalos:** Penzugyi_vizsgalat.txt 20. sor: "Segélyezések esetében a presbiteri határozatokat is be kell mutatni."

**Kartotéka ma:** A kiadas tábla (Database_schema.sql 286-324) tartalmaz atvevo, atvevoid, megjegyzes, decont_id, dispozitie_id mezőket — de nincs jegyzokonyv_hatarozat_id vagy hasonló hivatkozás a jegyzokonyv_hatarozatok táblára (Database_schema.sql 1500-1515). A kapcsolat csak szabad szöveggel, a megjegyzés mezőben rögzíthető.

**Következmény:** A számvevő a segélykiadás mellé kéri a határozatot; a rendszer nem tudja megmondani, melyik kiadáshoz melyik határozat tartozik, így a keresés kézi.

#### 🟡 KISEBB — Pecsétnyomók nyilvántartása nincs (a meglévő pecsét-kód mást csinál)

**Hivatalos:** Penzugyi_vizsgalat.txt 69. sor: "Pecsétnyomók nyilvántartása".

**Kartotéka ma:** apps/web/lib/iktato/pecset.ts és az apps/web/components/filing/iktato-print.tsx printIktatoPecset (82. sor) az IKTATÓPECSÉT-BLOKKOT nyomtatja egy irathoz (Iktatva / Kelt / Ikt. sz / I.gy / Sorsz / Elintézve) — ez nem a fizikai pecsétnyomók regisztere (darab, lenyomat, átvevő, átadás dátuma, megsemmisítés).

**Következmény:** Kis tétel, de a listán szerepel; ma semmi nem áll elő hozzá.

#### 🟡 KISEBB — Egyházmegyei hatókörben a költségvetés-módosítások véglegesítése hardkódolt false

**Hivatalos:** Penzugyi_vizsgalat.txt 11-13. sor: "Költségvetés kiegészítés, ha szükség volt rá az év folyamán - a hozzá tartozó presbiteri határozattal ... az esperes és a számvevő aláírásával".

**Kartotéka ma:** apps/web/app/(dashboard)/penzugy/actions.ts:1853-1858 a diocese hatókörű beállítás-normalizálásnál budget_mod1/2/3_finalized: false és _at: null értéket ír be fixen, holott a bealitas táblában léteznek a valós oszlopok (migration-docs/sql/2026-04-12-budget-modifications.sql:5-13: budget_mod1..3_finalized, _date, _hatarozat). Gyülekezeti hatókörben ez helyesen működik.

**Következmény:** Egyházmegyei szinten a költségvetés-kiegészítés nyomtatványa sosem mutat véglegesítést. Csak a diocese-ágat érinti, ezért nem blocker — de a nyomtatvány néma módon hiányos.

### Ami teljesen hiányzik

- Nem tudtam ELLENŐRIZNI, hogy az élő adatbázisban valóban léteznek-e a bealitas.leltar_iktatoszam / leltar_hatarozat_szam / leltar_hatarozat_datum oszlopok — a migration-docs/Database_schema.sql egy DUMP, nem bizonyíték (lásd a repó saját hibaosztály-jegyzetét: a migration-fájl nem bizonyíték). Az 5. SQL-ellenőrzés információs sémából kéri vissza.
- Nem néztem meg a desktop (Tauri) paritást: apps/desktop/src/components/finance-print-dialog.tsx külön printableTypes-listát építhet, így ott a nyomtatványkészlet eltérhet a webestől. Ezt külön felmérés kell.
- Nem ellenőriztem a nyomtatványok LAPTÖRDELÉSÉT és A4-hűségét, csak a mezők meglétét/hiányát. A hivatalos ívek fix sorszáma (Anyagraktar_iv: 30 sor/lap, Leltar_iv: 50 sor/lap, Irattari_leltar: 300 sor/lap) nem lett összevetve a builderek oldaltörésével.
- Nem néztem át a Kimutatasok_2026.xlsx 'Fo_konyv' és 'Naplo' lapjainak pontos oszlopkészletét — a Registrul-Jurnal és a Registru Banca oszlop-szintű hűsége (különösen a román rovatnevek) külön ellenőrzést igényel.
- Nem vizsgáltam az RLS-t: hogy az egyházmegyei számvevő pontosan mely nyomtatvány-adatokat éri el a saját megyéjén belül. A 2026-08-11-szamvevo-megyei-hozzaferes.sql létezik, de a hatását nem futtattam le.
- Az Utmutato_az_EREK_szamadasahoz.txt és a 14_Egyhazi-adminisztracio... fájlokat nem olvastam végig — ezekben lehetnek további formai előírások a fenti nyomtatványokra.

> **Megjegyzés:** JAVASLAT: „Pénzügyi vizsgálat felkészítő" nézet — egy gomb, egy PDF-csomag.

HOL: /penzugy új fül („Vizsgálat"), a Súgó mellett — mert a lelkész ott keresi a nyomtatványokat. A meglévő FinanceSugoChecklist.tsx mintáját követve, de a Penzugyi_vizsgalat.txt NÉGY blokkjával (Pénzügyvitel / Leltár / Alkalmazottak / Segélyszállítmányok), nem a könyvelési ritmussal.

MIT MUTAT: mind a 41 tétel egy listában, tételenként három állapottal:
  ZÖLD  = a Kartoteka ki tudja adni → ott a „Nyomtat" gomb (ma 19 tétel)
  SÁRGA = az adat megvan, de nincs nyomtatvány → „Ezt még pótolni kell" (irattári leltár, nyugtatömb-anyagraktárkönyv, Extras de cont)
  SZÜRKE = a rendszeren kívüli papír → checkbox „megvan a dossziéban" + megjegyzés-mező (alkalmazotti iratok, telekkönyv, adóhivatali nyilatkozat)
A szürke tételeknél a kipipálás egy új táblába (pl. vizsgalat_felkeszules: congregation_id, ev, tetel_kod, allapot, megjegyzes, updated_by) menne — így év múlva látszik, mi volt kész.

AZ EGY GOMB: „Teljes csomag nyomtatása (év = 2026)" → egyetlen PDF-be fűzi, ebben a sorrendben:
  1. Fedőlap: gyülekezet, év, a csomag tartalomjegyzéke, a hiányzó tételek listája FELTŰNŐEN
  2. Költségvetés + Költségvetés-módosítások + Számadás (borítóval, határozattal, iktatószámmal)
  3. Registru Casa × 12 hónap
  4. Registru Banca × bankszámla, Jan_Dec éves változatban
  5. Registrul-Jurnal (Főkönyv), éves
  6. Csoportnapló, éves
  7. Nyugtatömb kimutatás
  8. Leltárív + Registru inventar + Vagyonleltári jelentés + Leltárból törölt tárgyak
  9. Anyagraktárkönyv (minden anyag)
  10. Iktatókönyv + (új) Irattári leltár
Technikailag ez a meglévő builderek egymás utáni hívása és a HTML-ek összefűzése; a print-engine-v2 printToPdf már kezeli a többoldalas dokumentumot, a page-break-after: always mintát mindegyik builder használja.

ELŐFELTÉTELEK — ezek nélkül a csomag hamis biztonságot ad, ezért ELŐBB javítandó:
  (1) budget-reporting.ts iktatoszam/hatarozatSzam/hatarozatDatum bekötése a két print-dialogban (blocker #1);
  (2) leltár véglegesítés + a leltar_iktatoszam/hatarozat mezők bekötése és a Vagyonleltári jelentésre kivezetése (blocker #3);
  (3) Leltárív aláírás-blokkja (Comisia de inventariere 3 tag + Átadó/Átvevő) — a signature-grid CSS már ott van a fájlban;
  (4) készpénz-plafon ellenőrzések a finalization-actions.ts check-listájába (blocker #2) — a fenti 1-3. SQL logikája szerver-oldali CheckItem-ként.

A csomag akkor lesz valódi elfogadási teszt, ha a fedőlap NEM azt írja ki, mit tudott kinyomtatni, hanem azt, MI HIÁNYZIK. Amíg a 41-ből 22 tételre nincs papír, a legfontosabb funkció az őszinte hiánylista.

---

## 2. Készpénzhasználati törvényi korlátok kikényszerítése (Változások 2026 – Készpénzhasználat fejezet)

A hivatalos csomag (Valtozasok_2026.txt, Készpénzhasználat fejezet: 1. oldal 35–41. sor + 2. oldal 44–61. sor) hét konkrét, számszerű készpénz-korlátot ír elő: 50 000 lej kassza-plafon (a többlet 3 napon belül bankba), készpénzes kölcsön abszolút tilalma, 1 000 lej/nap/személy decont-előleg, 5 000 lej/nap/jogi személy elfogadható készpénz-bevétel, 10 000 lej/nap összes cégkifizetés (azon belül max. 5 000 lej egy cégnek), 5 000 lej feletti számla kötelező részleges banki fizetése, a kifizetés feldarabolásának tilalma, valamint 10 000 lej/nap magánszemély-korlát (kivéve az alkalmazott havi fizetése). Az Útmutató (Utmutato_az_EREK_szamadasahoz.txt 27–29., 400–404. és 876. sor) ugyanezeket megerősíti, két ponton eltérő számmal. A Kartotéka ezekből EGYETLEN korlátot sem kényszerít ki: a teljes szabályhalmaz kizárólag súgó-szövegként létezik (apps/web/components/finance/penzugy-help.tsx, CashRulesContent(), 1040–1117. sor). Végigkövettem a teljes adatláncot – UI (packages/ui-app/src/finance/CombinedEntryBody.tsx, DecontTabBody.tsx, DispozitieDialogBody.tsx) → zod-sémák (packages/validations/src/finance/*, apps/web/lib/validations/finance.ts) → use-case (packages/core/src/finance/kiadas/save.ts, befizetes/save.ts) → szerver-akció (penzugy/actions.ts, decont-actions.ts, dispozitie-actions.ts) → tábla (kiadas, befizetes, decont, dispozitie) –, és az összeg-mezőre mindenhol csak .positive() szűrés van; felső határ, napi aggregáció, partner-szintű összesítés vagy DB-CHECK/trigger sehol nincs. Ráadásul strukturális adathiány is fennáll: a fő tétel-rögzítő batch-sémája (expenseBatchRowSchema) nem is tartalmaz kedvezmenyezett_cui mezőt, a desktop párja pedig explicit null-t ír bele, így ma nincs megbízható jogi személy / magánszemély jelzés, amire a korlátok támaszkodhatnának. Fontos ellenpont: a rendszer TUD plafon-figyelőt építeni – a TVA-plafon (apps/web/lib/finance/tva-plafon-constants.ts + tva-plafon.ts) pontosan ezt a mintát valósítja meg sárga/narancs/piros szintekkel –, tehát a készpénz-korlátoknál nem technikai akadályról, hanem meg nem épített funkcióról van szó.

### Eltérések

#### ⛔ BLOKKOLÓ — (b) 1 000 lej decont-előleg: a decont-mentés korlátlan előleget elfogad

**Hivatalos:** Valtozasok_2026.txt, 2. oldal 44–47. sor: Nem adhatunk ki előlegként elszámolásra (decont) 1 000 lejnél többet készpénzben vásárlási célra. Ezt a felső értéket naponta és személyenként kell értelmezni. (pl egy konferencia, vagy tábor megszervezésére nem adhatunk csak 1 000 lejt előlegként a bevásárlásokra)

**Kartotéka ma:** A rendszernek VAN decont-modulja saját Kapott előleg mezővel: packages/ui-app/src/finance/DecontTabBody.tsx:333 (input type=number min=0, felső határ nélkül) → apps/web/app/(dashboard)/penzugy/decont-actions.ts:277 const advance = Number(input.advance) || 0. A saveDecont() validációja (246–258. sor) csak a dátumot, az elszámoló nevét, a kategóriát és a tételek meglétét ellenőrzi; az advance értékére NINCS semmilyen korlát. Ugyanígy az előleg tényleges kifizetése Dispoziție de plată-val: dispozitie-actions.ts:327 csak annyit néz, hogy az összeg pozitív.

**Következmény:** Egy tábor- vagy konferencia-szervezés előtt a lelkész nyugodtan kiad 5 000 vagy 10 000 lej előleget készpénzben, a rendszer hibátlanul kinyomtatja hozzá a hivatalos Dispoziție de plată-t, és a decont is lefut. A bizonylat maga válik a szabálysértés írásos bizonyítékává a pénzügyi vizsgálaton.

#### ⛔ BLOKKOLÓ — (e) 5 000 lej feletti számla teljes készpénzes kifizetése: egyetlen tétel is korlátlan

**Hivatalos:** Valtozasok_2026.txt, 2. oldal 56–58. sor: 5 000 lejnél nagyobb értékű számlákat legtöbb 5 000 lejig fizethetünk ki készpénzben, az 5 000 lej feletti összeget kötelezően banki utalással fizethetjük ki.

**Kartotéka ma:** Egyetlen készpénzes kiadás összegére sincs felső korlát: packages/validations/src/finance/kiadas-save.ts:30-32 (osszeg csak .positive()), apps/web/lib/validations/finance.ts:116 (batch-sor ugyanígy), és a DB-ben sincs CHECK constraint az osszeg oszlopon (migration-docs/Database_schema.sql, kiadas tábla). A UI sem figyelmeztet: packages/ui-app/src/finance/CombinedEntryBody.tsx-ben a sor-szintű figyelmeztetések csak a dátumra (dateWarning, 833. sor) és az iratszám-duplikátumra (receiptWarning, 877. sor) vonatkoznak; a rowValidIn() (641. sor) csak annyit néz, hogy az összeg > 0. Ráadásul a kiadás oldalán a számla teljes összege nem is rögzíthető külön a kifizetéstől – az invoice_amount csak az ANAF/Oblio-párosításnál (oblio_kiadas_match tábla) létezik.

**Következmény:** Egy 12 000 lejes kazán- vagy építőanyag-számla egyetlen készpénzes tételként rögzíthető és kinyomtatható kiadási kísérőívvel. Ez a legkonkrétabb, egyetlen tranzakcióval elkövethető törvénysértés, amit a rendszer aktívan támogat.

#### ⛔ BLOKKOLÓ — Strukturális gát: a fő tétel-rögzítő nem is gyűjt CUI-t / partner-típust, így a korlátok ma nem kikényszeríthetők

**Hivatalos:** A Valtozasok_2026.txt 2. oldal 48–61. sora a korlátokat kifejezetten a jogi személyek közötti, valamint a jogi személy és magánszemélyek közötti készpénzfizetések értékhatáraiként fogalmazza meg – a kikényszerítés előfeltétele tehát, hogy minden készpénzes tételről tudjuk, jogi vagy magánszemély a partner.

**Kartotéka ma:** A kiadas táblán ugyan VAN kedvezmenyezett_cui oszlop (Database_schema.sql, kiadas), de a fő beviteli út nem tölti: a köteges séma apps/web/lib/validations/finance.ts:112 expenseBatchRowSchema egyáltalán nem tartalmazza a mezőt, a desktop rögzítő pedig explicit null-t ír be (apps/desktop/src/components/combined-entry-dialog.tsx:171). A CUI ma csak az Oblio/ANAF-párosítás során kerül az adatba (packages/ui-app/src/finance/oblio/oblio-matcher.ts:334, oblio_kiadas_match.supplier_cui). A bevételi oldalon (befizetes tábla) egyáltalán nincs CUI vagy partner-típus oszlop.

**Következmény:** Amíg a rögzítő nem kérdezi meg, hogy cégnek vagy magánszemélynek fizetünk-e, addig az (c), (d), (e), (f) és (g) korlátot nem lehet sem blokkolni, sem megbízhatóan visszamenőleg auditálni. Ez a legalsó blokkoló ok: minden más javítás ezen múlik.

#### 🔴 SÚLYOS — (a) 50 000 lej kassza-plafon: nincs sem figyelés, sem figyelmeztetés

**Hivatalos:** Valtozasok_2026.txt, 1. oldal 37–39. sor: A pénztárban lévő készpénz összege nem haladhatja meg az 50 000 (ötvenezer) lejt. Amennyiben ezt az összeget meghaladja a kasszában levő készpénz, a többletet be kell helyezni a bankba 3 napon belül. Megerősíti: Utmutato_az_EREK_szamadasahoz.txt 27–29. sor (Casa / Készpénz egyenleg, 2. sorszám): 2023 novembere óta érvényben van az 50 000 lejes kasszaplafon.

**Kartotéka ma:** A rendszer kiszámolja a kassza-egyenleget (packages/ui-app/src/finance/helpers.ts:204 calculateBalances, kassza = bankszamla_id IS NULL) és több helyen kiírja (FinanceDashboard.tsx:229, AccountingTab.tsx:452, CashbookTab.tsx:619/637), de az 50 000 lejes küszöbre SEHOL nincs összehasonlítás. A teljes monorepóban az 50 000 szám egyetlen pénzügyi előfordulása a súgó szövege: apps/web/components/finance/penzugy-help.tsx:1050. Nincs napi egyenleg-őr, nincs banner, nincs e-mail/értesítés, és az év végi ellenőrzőlista (packages/ui-app/src/finance/FinanceSugoChecklist.tsx:163) is csak a fizikai megszámlálást kéri, plafon-ellenőrzést nem.

**Következmény:** Egy nagyobb adománygyűjtés, perselypénz-hullám vagy járulék-beszedési nap után a kassza némán 50 000 lej fölé mehet, és a lelkész semmiből nem tudja meg. A 3 napos banki letételi határidő lecsúszik, a pénzügyi vizsgálaton (Penzugyi_vizsgalat.txt: Kasszakönyv havonként nyomtatva) a számvevő a kinyomtatott kasszakönyvből azonnal látja a túllépést. Bírság és jegyzőkönyvi meghagyás kockázata.

#### 🔴 SÚLYOS — Ellentmondó előleg-küszöb a saját súgóban: 1 000 lej és 5 000 lej is szerepel

**Hivatalos:** Két hivatalos forrás eltér: Valtozasok_2026.txt 2. oldal 44–45. sor 1 000 lejt ír, míg Utmutato_az_EREK_szamadasahoz.txt 876. sor (207.02 Kiadott hitelek magyarázata, 111. sorszám) azt írja: Az előlegként kiadható összeg 5000 lej/személy/nap. A Változások a frissebb és a 2026-ra kiadott dokumentum.

**Kartotéka ma:** A Kartotéka súgója MINDKETTŐT átveszi, egymás mellett, feloldás nélkül: apps/web/components/finance/penzugy-help.tsx:1060 (Nem adhatunk ki előlegként elszámolásra (decont) 1 000 lejnél többet) és ugyanabban a nézetben penzugy-help.tsx:1105 (Az előlegként kiadható összeg 5000 lej/személy/nap), valamint a kód-katalógusban penzugy-help.tsx:633 (207.02 leírás). Nincs jelzés arról, melyik a mérvadó.

**Következmény:** A lelkész a saját rendszerének súgójából két különböző jogszabályi számot olvas ki. Ha az 5 000 lejeset követi, a Változások 2026 szerinti szabályt sérti meg – a rendszer segítségével. Ez a legrosszabb fajta hiba: nem hiányzó információ, hanem magabiztosan tálalt ellentmondás.

#### 🔴 SÚLYOS — (c) 5 000 lej/nap/jogi személy készpénz-BEVÉTEL: nincs ellenőrzés és nincs is hozzá adat

**Hivatalos:** Valtozasok_2026.txt, 2. oldal 50–52. sor: Az egyházközség naponta legtöbb 5 000 lejt fogadhat el egy másik jogi személytől (egyházközségtől vagy cégtől) készpénzben. Az összbevétel nincs korlátozva 5 000 lejre, más jogi személytől elfogadhatunk újabb 5 000 lejt.

**Kartotéka ma:** A befizetés-mentés (packages/core/src/finance/befizetes/save.ts, séma: packages/validations/src/finance/befizetes-save.ts:34 osszeg .positive()) semmilyen felső határt nem néz, és napi/partner-szintű összesítést sem végez. Ennél súlyosabb: a befizetes táblán (migration-docs/Database_schema.sql, CREATE TABLE public.befizetes) NINCS partner-típus és NINCS CUI oszlop – csak forrasa (szabad szöveg), id_szemely és id_csalad. A rendszer tehát nem is tudja megkülönböztetni a jogi személyt a magánszemélytől a bevételi oldalon.

**Következmény:** Egy másik egyházközségtől vagy cégtől átvett 8 000 lej készpénz nyugtázása simán átmegy, és később sem lehet kimutatni, hogy jogi személytől jött-e. A szabály kikényszerítése ma nem csak elmarad, hanem adathiány miatt utólag sem auditálható – ezért az SQL-ellenőrzés is csak közelítést tud adni.

#### 🔴 SÚLYOS — (d) 10 000 lej/nap összes cégkifizetés: nincs napi aggregáció sehol

**Hivatalos:** Valtozasok_2026.txt, 2. oldal 53–55. sor: Egy nap során összesen legfeljebb 10 000 lej készpénz használható fel kifizetések lebonyolítására különböző cégek számára. Ügyelni kell arra, hogy egyetlen cégnek sem adhatunk 5 000 lejnél többet készpénzben. Megerősíti: Utmutato_az_EREK_szamadasahoz.txt 401–403. sor (107.01 magyarázat).

**Kartotéka ma:** A kiadás-mentés minden ágon soronként dolgozik, napi összesítés nélkül: packages/core/src/finance/kiadas/save.ts (online ág 242–302. sor, offline ág 367–471. sor) és a köteges út apps/web/app/(dashboard)/penzugy/actions.ts:2083 saveExpenseBatch(), ami a sorokon egyszerű for-ciklussal megy végig (2124. sortól). A batch-séma (apps/web/lib/validations/finance.ts:112 expenseBatchRowSchema) egyetlen mezőt sem tartalmaz partner-azonosításra a szabad szöveges kedvezmenyzett-en kívül. Így ugyanazon a napon rögzített 5 db 3 000 lejes készpénzes kiadás (15 000 lej) semmilyen jelzést nem vált ki.

**Következmény:** Egy építkezési vagy felújítási napon a rendszer engedi a 10 000 lej fölötti napi készpénz-kiáramlást, sőt a Registru Casa nyomtatásban is szabályosnak látszik. A napi limit sérülése csak az ellenőr kézi összeadásakor derül ki.

#### 🔴 SÚLYOS — (f) A kifizetés feldarabolásának tilalma: nincs detektor

**Hivatalos:** Valtozasok_2026.txt, 2. oldal 57–58. sor: Nem oszthatjuk fel a kifizetést kisebb részekre, hogy így kikerüljük a törvényi előírásokat.

**Kartotéka ma:** Nincs semmilyen azonos-nap + azonos-partner mintakeresés. A kötegelt rögzítő (packages/ui-app/src/finance/CombinedEntryBody.tsx) éppen hogy megkönnyíti, hogy egy nap több sort vigyünk fel ugyanarra a partnerre; a szerver-oldali saveExpenseBatch (apps/web/app/(dashboard)/penzugy/actions.ts:2083) a sorokat egyenként szúrja be, összefüggés-vizsgálat nélkül. Sem a kiadas.atvevo, sem a kedvezmenyezett_cui nincs normalizálva vagy indexelve partner-szintű aggregációhoz.

**Következmény:** A rendszer nemhogy nem akadályozza, hanem a kötegelt beviteli felületével kényelmesebbé teszi az 5 000 lejes határ megkerülését (pl. 3 x 4 500 lej ugyanannak a cégnek egy napon). Ha az ellenőr ezt észreveszi, az szándékos kijátszásnak minősül, ami súlyosabb megítélés alá esik, mint egy egyszerű túllépés.

#### 🔴 SÚLYOS — (g) 10 000 lej magánszemély-korlát és az alkalmazotti fizetés kivétele: nincs ellenőrzés, és nincs bér-jelölés

**Hivatalos:** Valtozasok_2026.txt, 2. oldal 59–61. sor: egy magánszemélytől az egyházközség naponta legtöbb 10 000 lej készpénzt fogadhat el és legtöbb 10 000 lejt fizethet ki; ez alól kivételt képez az alkalmazottunk havi fizetése.

**Kartotéka ma:** A magánszemély a kiadásnál az atvevoid (szemely FK) meglétével azonosítható, a bevételnél az id_szemely-lyel – de egyik oldalon sincs napi összesítés vagy küszöb. Az alkalmazotti fizetés kivétele sem jelölhető: nincs alkalmazott/munkaviszony tábla (a Database_schema.sql-ben nincs alkalmazott, munkavallalo vagy fizetes tábla), a bér-jogcím pedig kétértelmű – a 201.15 Nettó fizetések kódról az Utmutato_az_EREK_szamadasahoz.txt 555. sora azt írja: Esperesi hivatalok részére van fenntartva, egyházközség csak akkor könyvelhet ide, ha helyben számolnak fizetési jegyzéket.

**Következmény:** A rendszer nem tudja szétválasztani a jogszerű bérkifizetést a korlátozott magánszemély-kifizetéstől, ezért még utólagos ellenőrzést sem lehet rá pontosan futtatni. Egy 12 000 lejes készpénzes kifizetés egy magánszemélynek (pl. földvásárlás, munkadíj) észrevétlen marad.

#### 🔴 SÚLYOS — Készpénzes kölcsön tilalma (107.01 / 207.01): csak súgószöveg, a könyvelés engedi

**Hivatalos:** Valtozasok_2026.txt, 1. oldal 40–41. sor: Tilos az egyházközség számára készpénzben kölcsönt adni, csak bankszámlán lehetséges a kölcsönzés és a kölcsön visszafizetése is. Megerősíti: Utmutato_az_EREK_szamadasahoz.txt 400–401. sor (107.01): 2023. novembere óta csak banki utalással lehet a hitelt be- és vissza fizetni! A törvény tiltja a kassza direkt hitelezését.

**Kartotéka ma:** A szabály kizárólag súgó-szövegként létezik: apps/web/components/finance/penzugy-help.tsx:630 (107.01), :632 (207.01), :1102-1108 (Hitelek fejezet). A könyvelési láncban semmi nem tiltja, hogy egy 107.01 vagy 207.01 jogcímű tétel bankszamla_id IS NULL (azaz készpénz) legyen: a kategóriaválasztó (packages/ui-app/src/finance/CombinedEntryBody.tsx categoryOptions, 660. sortól) csak a belső-mozgás kódokat és a bank-bank átutalást szűri, a hitel-jogcímeket nem; a mentés (packages/core/src/finance/kiadas/save.ts, befizetes/save.ts) pedig a jogcímkódot egyáltalán nem vizsgálja.

**Következmény:** A lelkész a Kassza fülön kiválaszthatja a Kapott hitelek vagy Törlesztett hitelek jogcímet, és a rendszer készpénzes tételként elkönyveli – pontosan azt, amit a törvény tilt. A saját súgója ugyanezen a képernyőn mondja, hogy ez tilos.

#### 🟠 KÖZEPES — A plafon-figyelő minta létezik a rendszerben, de a készpénzre nem alkalmazták

**Hivatalos:** A Valtozasok_2026.txt 62–63. sora külön kiemeli: Egyelőre 2025 végén ezek a szabályok vannak érvényben, de ezeket a szabályokat bármikor módosíthatják, kövessük figyelemmel a változtatásokat – vagyis a küszöbök konfigurálható, karbantartható értékek kellenének legyenek.

**Kartotéka ma:** A TVA-plafonra pontosan ez az architektúra megvan: apps/web/lib/finance/tva-plafon-constants.ts (TVA_PLAFON_RON = 395_000, sárga/narancs/piros szintek, tvaFigyelmeztetesSzint(), tvaSzintMagyarazat()) + apps/web/lib/finance/tva-plafon.ts a számítással, sőt a desktop beállításokban külön értesítés-kapcsoló is van rá (apps/desktop/src/components/settings-dialog.tsx:302 Figyelmeztetések (TVA plafon, tartozások)). A készpénz-küszöbökre EGYETLEN konstans sem létezik – az 50 000 / 10 000 / 5 000 / 1 000 lej sehol nincs kódolt értékként, csak JSX-szövegben.

**Következmény:** Nem technikai akadályról van szó: a mintát csak át kellene emelni. Amíg ez nincs meg, minden jogszabály-változáskor kézzel kell átírni a súgó szövegét, és semmilyen automatizmus nem véd. Egy keszpenz-limit-constants.ts + napi aggregátor gyakorlatilag a TVA-figyelő másolata lenne.

#### 🟡 KISEBB — Határidő-ellentmondás: 3 nap vagy 2 munkanap a kassza-többlet bankba tételére

**Hivatalos:** Valtozasok_2026.txt 1. oldal 38–39. sor: a többletet be kell helyezni a bankba 3 napon belül. Ezzel szemben Utmutato_az_EREK_szamadasahoz.txt 28–29. sor: Ha a készpénzegyenleg átlépi ezt az összeget, 2 munkanapon belül le kell tenni a készpénzt a bankba.

**Kartotéka ma:** A Kartotéka súgója a 3 napos változatot vette át (apps/web/components/finance/penzugy-help.tsx:1052), az Útmutató 2 munkanapos szigorúbb megfogalmazása sehol nem jelenik meg. Mivel egyik változat sincs kikényszerítve, gyakorlati hatása ma nincs – de ha a plafon-figyelő megépül, el kell dönteni, melyik határidőre számoljon vissza.

**Következmény:** A jövőbeli figyelmeztetés helyes tervezéséhez tisztázni kell a mérvadó határidőt. Konzervatív választás a szigorúbb 2 munkanap (az Útmutató a részletesebb, számadás-specifikus dokumentum), a 3 napos szöveget pedig legalább lábjegyzetben jelezni kell.

### Ami teljesen hiányzik

- Nincs kassza-plafon figyelő: sem napi egyenleg-őr, sem 50 000 lejes küszöb-összehasonlítás, sem banner/értesítés (a TVA-plafon figyelő mintája ott van, de a készpénzre nem alkalmazták)
- Nincs napi készpénz-aggregátor: sem a szerver-akciókban (saveExpenseBatch, saveIncomeBatch, saveDecont, saveDispozitie), sem a UI-ban nincs adott napra/partnerre összesítés
- Nincs partner-típus (jogi személy / magánszemély) mező sem a kiadás-, sem a bevétel-rögzítőben
- Nincs CUI/adószám mező a fő tétel-rögzítőben: a kiadas.kedvezmenyezett_cui oszlop létezik, de csak az Oblio/ANAF-párosítás tölti; a desktop rögzítő explicit null-t ír bele
- A befizetes táblán egyáltalán nincs CUI vagy partner-típus oszlop – a bevételi oldali 5 000 lejes jogi személy korlát adathiány miatt nem auditálható
- Nincs számla-összeg mező a kiadásnál (a fizetett összegtől független invoice_amount csak az oblio_kiadas_match táblában létezik), ezért az 5 000 lej feletti számla részleges banki fizetése nem ellenőrizhető a nem-ANAF számlákra
- Nincs alkalmazott/munkaviszony nyilvántartás és nincs bér-jelölés, így az alkalmazotti havi fizetés kivétele nem különíthető el a 10 000 lejes magánszemély-korláttól
- Nincs feldarabolás-detektor (azonos nap + azonos partner + több készpénzes tétel mintakeresés)
- Nincs jogcím-alapú fizetési mód kényszer: a 107.01 / 207.01 hitel-jogcímek készpénzben (bankszamla_id IS NULL) is rögzíthetők
- Nincs konfigurációs konstans-fájl a készpénz-küszöbökre (a tva-plafon-constants.ts mintájára), ezért jogszabály-változáskor csak a súgó szövegét lehet átírni
- Nincs DB-szintű védelem: sem CHECK constraint, sem trigger a kiadas.osszeg / befizetes.osszeg oszlopon, és nincs napi limitet érvényesítő RPC
- Nincs döntés arról, hogy az 1 000 lejes (Változások 2026) vagy az 5 000 lejes (Útmutató 207.02) decont-előleg-küszöb a mérvadó – a súgó ma mindkettőt közli
- Nincs eldöntve a kassza-többlet határideje: 3 nap (Változások) vagy 2 munkanap (Útmutató)

> **Megjegyzés:** MÓDSZERTAN ÉS BIZONYOSSÁG. Minden állítást a kódban ellenőriztem, nem következtettem. A teljes adatlánc bejárva: (1) UI — CombinedEntryBody.tsx (a fő tétel-rögzítő, 2107 sor: a rowValidIn() csak osszeg > 0-t néz, a sor-figyelmeztetések kizárólag dátum + iratszám-duplikátum), DecontTabBody.tsx, DispozitieDialogBody.tsx, ExpenseDialogBody.tsx, IncomeDialogBody.tsx; (2) zod-sémák — packages/validations/src/finance/kiadas-save.ts, befizetes-save.ts, apps/web/lib/validations/finance.ts (expenseSchema, expenseBatchRowSchema, incomeBatchRowSchema): mindenhol csak .positive(); (3) use-case — packages/core/src/finance/kiadas/save.ts és befizetes/save.ts (online + offline ág); (4) szerver-akció — penzugy/actions.ts saveExpenseBatch(), decont-actions.ts saveDecont(), dispozitie-actions.ts saveDispozitie(); (5) tábla/RPC — migration-docs/Database_schema.sql (kiadas, befizetes) és migration-docs/sql/2026-06-06-decont-dispozitie-sorszam.sql (decont, dispozitie): nincs CHECK constraint az összeg-oszlopokon, és a next_bizonylat_szam RPC sem validál összeget. Az RLS-réteg (finance-scope.ts financeWriteBlock, isYearFinalized) hatókört és év-zárat véd, összeghatárt nem.

MIT NEM ÁLLÍTOK. Nem néztem meg soronként az összes bank-import és Oblio-útvonalat; ott elméletileg lehetne összeg-ellenőrzés, de azok az utak banki tételeket hoznak be (bankszamla_id NOT NULL), amelyekre ezek a készpénz-korlátok nem vonatkoznak. A repóban lévő SQL-fájlok nem bizonyítják, hogy élesben mi fut — ezért minden megállapítást read-only SELECT-tel is ellenőrizhetővé tettem.

AZ SQL-EK HASZNÁLATA. Mind a 10 lekérdezés read-only SELECT, magyar kommenttel, és minden esetben megmondom a VÁRT eredményt (a legtöbbnél: 0 sor). Közös konvenciók, amelyeket a rendszer saját számítási logikájából vettem át (packages/ui-app/src/finance/helpers.ts calculateBalances): készpénz = bankszamla_id IS NULL; a törölt (deleted) és stornózott (stornozott) tételek kimaradnak; az összeg COALESCE(osszeg_ron, osszeg); a belső mozgásokat (kassza↔bank átvezetés) a belso_mozgas_xkey és a 3xx/4xx kódprefix alapján zárom ki, mert azok nem valós kifizetések. A congregations táblából COALESCE(nev_hu, name)-t használok megjelenítésre.

AZ UTOLSÓ (10.) LEKÉRDEZÉS KÜLÖNÖSEN FONTOS. Az nem szabálysértést keres, hanem azt méri, hogy a meglévő adatból egyáltalán ki lehetne-e kényszeríteni ezeket a korlátokat. Ha a nincs_semmi_jelzes_szazalek magas (amire a kód alapján számítok, mivel a rögzítő nem gyűjt CUI-t), az bizonyítja, hogy a javítás első lépése nem a validáció, hanem a beviteli űrlap bővítése partner-típussal és CUI-val.

DÖNTÉST IGÉNYLŐ NYITOTT KÉRDÉS. Két ponton a két hivatalos forrás eltér, és ezt a Kartotéka feloldás nélkül tükrözi vissza: a decont-előleg 1 000 lej (Változások 2026) vagy 5 000 lej (Útmutató 207.02), illetve a kassza-többlet bankba tétele 3 napon belül (Változások) vagy 2 munkanapon belül (Útmutató). Bármilyen figyelmeztetés megépítése előtt ezt el kell dönteni — javaslatom a szigorúbb érték (1 000 lej, 2 munkanap), a másik értéket pedig magyarázó lábjegyzetben jelezni.

---

## 3. Lelkészi jelentés — az EGYSZERŰ űrlap és a munkanaplóval EGYBEÉPÍTETT változat összevetése, és a Kartotéka lelkeszi-jelentes moduljának támogatása

Az EREK 2026-os csomag két lelkészi jelentés űrlapot ad ki (Valtozasok_2026.txt, 1. oldal: „Az új űrlap két változatban érhető el, egyszerű űrlapként, és egybeépítve a digitális munkanaplóval… 2026-tól kötelező"). A két munkafüzet 'Jelentes' lapja — vagyis a ténylegesen kinyomtatott és beküldött papír — BIT-AZONOS: a normalizált diff EGYETLEN eltérést ad, az N18 verzió-jelölőt ('v 1.0a' vs 'v 1.0b'). A különbség kizárólag az 'Adatlap' bevitel-lapon van: az egybeépített változatban 64 cella képlet (C→P→Szolgalati_alkalmak/Katekezis/Csaladlatogatas), az egyszerűben ugyanez a 64 cella ÜRES, kézzel töltendő, `type=whole f1='0'` validációval. Ezt a 'Sugo_lelkeszi jelenteshez' lap szó szerint kimondja: az egyszerűben pl. D67='A vasárnap délelőtti istentiszteletek számát kell beírni, egész számmal.', az egybeépítettben ugyanaz a cella 'Az adatokat a digitális munkanaplóból, a "Szolgálati_alkalmak" lapról veszi át.'. A Kartotéka JELENTES_MEZOK katalógusa (apps/web/lib/lelkeszi-jelentes/types.ts) EGYETLEN, fixen bedrótozott auto/kézi felosztást ismer — nincs sehol „vezetek munkanaplót / nem vezetek" kapcsoló (a `vezet_munkanaplo`-szerű beállításra a teljes repóban 0 találat). A kettősség tehát NINCS támogatva. A gyakorlati következmény súlyos: ha nincs munkanapló-adat, a `computeAuto` hiba nélkül lefut, és 18 hivatalos rubrikába KEMÉNY 0-t ír (nem null-t), 22-be null-t. A `mezoErtek` prioritása (felulirasok > auto > kezi) miatt a 0 legyőzi a kézi értéket, a `saveLelkesziJelentes` `keziMezok` szűrője (lelkeszi-jelentes-actions.ts:1021-1025) pedig az auto-mezőre írt kézi értéket eldobja — a lelkész csak mezőnkénti ceruzás felülírással tud számot beírni. A varázsló hiány-jelzője (`hianyzoAutoMezok`, lelkeszi-jelentes-dialog.tsx:611-614) `=== null`-ra jár, tehát a 18 nullát NEM jelzi hiányzónak: a lelkész úgy véglegesíti és írja alá a nyomtatványt, hogy 18 rovatban 0 áll.

### Eltérések

#### ⛔ BLOKKOLÓ — A KÉT VÁLTOZAT TELJES MEZŐ-ELTÉRÉSE: pontosan 64 cella, ami az egybeépítettben AUTO, az egyszerűben KÉZI

**Hivatalos:** Lelkeszi_jelentes.txt vs Munkanaplo_Lelkeszi_jelentes.txt, 'Adatlap' lap, C oszlop (a C..L a 2026–2035 évoszlopok, M=Összesen; a P..Y a rejtett segéd-oszlopok). Az egybeépítettben C=„=P{sor}" vagy „=IF(...ROUND(P{sor}/...))", az egyszerűben ÜRES. A 64 sor, a P-képlet forrásával: (a) Szolgalati_alkalmak lapról — 14 F. keresztelő, 15 N. keresztelő, 16 F. temetés, 17 N. temetés, 46 Azonos esketés, 47 Vegyes esketés, 51/52 a. közönséges vasárnap de./du., 53/54 b. ünnepnapokon de./du. (=SUM(P234,P236,…P252) ill. P235…P253), 55/56 c. rendszeres hétköznapi i.t. de./du., 57/58 d. bűnbánati héten de./du., 59 e. bibliaórák (=SUM(P93:P101), HÉT bibliaóra-fajta összege), 60 f. kazuáliák és felkészítők (=SUM(P14:P17,P46:P47,P230:P232) = keresztelő+temetés+esketés+keresztelői felkészítő+jegyesbeszélgetés+virrasztó), 61 g. más alkalmak (=SUM(P102:P104,P255:P257) = vallásos ünnepély+szeretetvendégség+imahét+úrvacsora templomban+betegúrvacsora+egyéb szolgálat), 62 h. digitális alkalmak, 63/64 vasárnapi átlagjelenlét de./du., 65/66 ünnepi átlagjelenlét de./du., 67–84 Karácsony I/II/III + Húsvét I/II/III + Pünkösd I/II/III mind de. ÉS du. (18 cella, RÉSZTVEVŐ-szám), 85/86 hétköznapi átlag de./du., 87/88 bűnbánati átlag de./du., 89 úrvacsoraosztások száma, 90/91 átlag úrvacsorázó férfi/nő, 93 felnőtt bibliaóra, 94 ifjúsági bibliaóra, 95 presbiteri bibliaóra, 96 nőszövetségi bibliaóra, 97 házasok bibliaórája, 99 Más bibliaóra 1 alkalmai, 101 Más bibliaóra 2 alkalmai, 102 vallásos ünnepélyek, 103 szeretetvendégségek, 106 imaheti átlagjelenlét, 112 presbiteri felkészítők; (b) Csaladlatogatas lapról — 107 meglátogatott család (N107='CsL'), 108 meglátogatott beteg (N108='BL'); (c) Katekezis lapról — 161 vallásórára jár átlag, 163 vallásórák száma, 164 gyermekistentiszteletek, 165 vasárnapi iskolák. A 'Sugo_lelkeszi jelenteshez' lap D oszlopa mindkét fájlban végigkíséri ezt: pl. D109 egyszerű='A bibliaórák számát kell beírni.' / egybeépített='Az adatokat a digitális munkanaplóból, a "Szolgálati_alkalmak" lapról veszi át.'; D123/D124 egybeépített='…a "Családlátogatás" lapról veszi át.'; D177/D179/D180/D181 egybeépített='…a "Katekézis" lapról veszi át.'. A B7 súgó-sor is ezt tükrözi: egyszerű='Adatokat bevinni a jelentésbe az csak az "Adatlap" munkalapokon lehet', egybeépített='Adatokat bevinni a jelentésbe az "Adatlap, Szolgálati alkalmak, Katekézis, Családlátogatás" munkalapokon lehet'. A NYOMTATOTT eredmény ('Jelentes' lap) a két változatban azonos, csak az N18 verzió-jelölő tér el ('v 1.0a' / 'v 1.0b').

**Kartotéka ma:** apps/web/lib/lelkeszi-jelentes/types.ts:49-229 — a JELENTES_MEZOK katalógusban minden mező `auto` értéke FIX, fordítási időben eldöntött konstans. Nincs semmilyen kapcsoló, feltétel vagy beállítás, ami a lelkész választása szerint átbillentené. A `vezet_munkanaplo` / `munkanaplo_vezetes` / `vezetMunkanaplo` mintákra a teljes repóban (ts/tsx/sql, node_modules nélkül) 0 találat.

**Következmény:** Az EREK 2026-tól KÉT hivatalos munkamódot ismer el; a Kartotéka egyetlen, kevert modellt kínál. Aki nem vezet munkanaplót, annak a rendszer 18 rovatban 0-t ír alá helyette (lásd a következő tételt); aki vezeti, annak viszont 30+ olyan rubrika marad kézi, amit az EREK-táblázat magától kitöltene — vagyis mindkét lelkész-típus rosszul jár.

#### ⛔ BLOKKOLÓ — Munkanapló nélkül 18 hivatalos rubrika NÉMÁN 0-t kap, és a lelkész kézzel NEM tudja beírni

**Hivatalos:** Az EREK EGYSZERŰ űrlapján ugyanez a 18 rubrika sima, kitöltendő szám-cella (Lelkeszi_jelentes.txt 'Adatlap', DATA VALIDATIONS: `type=whole f1='0' sqref=… C51:L62 … C89:L89 C93:L97 C99:L99 C101:L103 …`), üresen hagyva pedig a 'Jelentes' lapon kitöltetlen rovatként jelenik meg — NEM nullaként.

**Kartotéka ma:** apps/web/app/(dashboard)/munkanaplo/lelkeszi-jelentes-actions.ts:530-696 — a `worklogRes.error === null` ág üres találati listánál is lefut, és a halmozók 0-s `db` mezője kerül az auto-rekordba: II.1a, II.2a, II.3a, II.4a, II.6a, II.7a, II.8a, II.9, II.12, II.14, III.1, III.2, III.3, III.5, III.7, III.8, III.10, V.3 = 18 mező KEMÉNY 0. (Az átlag-mezők — II.1b/c, II.2b/c, II.3b/c, II.4b/c, II.5a–i, II.6b, II.7b, II.8b, II.13, III.6 = 22 mező — helyesen null-ok.) A 0 ezután három helyen üt vissza: (1) types.ts:335-342 `mezoErtek` — `felulirasok > auto > kezi`, a 0 nem null, tehát MEGELŐZI a kézi értéket; (2) lelkeszi-jelentes-actions.ts:1021-1025 `keziMezok = new Set(JELENTES_MEZOK.filter((m) => !m.auto)…)` — az auto-mezőre írt kézi érték mentéskor NÉMÁN kiesik; (3) lelkeszi-jelentes-dialog.tsx:611-614 `hianyzoAutoMezok = …filter((m) => mezoErtek(currentData, m.id) === null)` — a 0 nem null, ezért a varázsló hiány-listája NEM figyelmezteti a lelkészt. A print.ts csak az ÜRES értéket rajzolja '—'-nak, a 0-t '0 alkalom'-ként nyomtatja.

**Következmény:** Egy munkanaplót nem vezető lelkész úgy véglegesíti és írja alá az egyházmegyének beküldött nyomtatványt, hogy 18 rovatban 0 áll — köztük 'a. közönséges vasárnapon de.' (II.1a), 'Hány alkalommal volt úrvacsoraosztás' (II.12), 'A lelkipásztor meglátogatott: családot' (III.7). A hibás számot csak úgy tudja javítani, hogy 18-szor rákoppint a ceruza-ikonra és felülírja; erre a UI sehol nem hívja fel a figyelmét. A véglegesítés a 0-kat a snapshotba FAGYASZTJA (lelkeszi_jelentes.snapshot).

#### 🔴 SÚLYOS — A de./du. bontás a Kartotékában nincs meg 3 istentisztelet-fajtánál (hivatalosan 6 cella → nálunk 3 szám)

**Hivatalos:** Adatlap 51/52 vasárnap de./du., 53/54 ünnepnap de./du., 55/56 rendszeres hétköznapi de./du., 57/58 bűnbánati de./du. — MINDEGYIK külön cella, mindkét változatban. Az egybeépítettben a du.-ág külön képlettel gyűjt: pl. P52='=SUM(COUNTIF(Szolgalati_alkalmak!$AC$4:$AC$8000,$P$1&$N52&$O$2),COUNTIF(…&$N52&$O$4))', ahol O2='Du.' és O4='Du.2'.

**Kartotéka ma:** types.ts:106-134 — II.1a/II.2a (vasárnap de./du.) MEGVAN, de az ünnepi (II.3a), a hétköznapi (II.6a) és a bűnbánati (II.7a) EGYETLEN szám, napszak-bontás nélkül. A `classifyForOfficialJournal` (apps/web/lib/worklog/print-columns.ts:207-210, 245) a bűnbánatinál ad ugyan 'reggel'/'este' slotot és a hétköznapinál `slot: null`-t, de az aggregátor (lelkeszi-jelentes-actions.ts:589-597) a slotot ezeknél eldobja.

**Következmény:** A hivatalos nyomtatvány II.1.b, II.1.c és II.1.d sorának du. rovatát a Kartotéka nem tudja kitölteni — a lelkésznek kézzel kell kettéosztania a saját adatát, vagy üresen hagyni az EREK űrlap felét.

#### 🔴 SÚLYOS — A 9 sátoros ünnepnap de./du. bontása elvész: 18 hivatalos cella → 9 Kartotéka-mező

**Hivatalos:** Adatlap 67–84: 'Karácsony_I. de.' / 'du.', 'Karácsony_II. de.' / 'du.', 'Karácsony_III. de.' / 'du.', ugyanígy Húsvét I–III. és Pünkösd I–III. — 18 külön cella, mindegyik a RÉSZTVEVŐK számával (az egybeépítettben P67='=SUM(SUMIF(…$H$4:$H$8000),SUMIF(…$I$4:$I$8000),…)', vagyis férfi+nő jelenlét).

**Kartotéka ma:** types.ts:120-130 + lelkeszi-jelentes-actions.ts:219-231 (`SATOROS_NAP_MEZO`) és :632-639 — II.5a–II.5i, ünnepNAPONKÉNT EGY mező, az aznapi ÖSSZES alkalom jelenlétének összege („oszloptól függetlenül — pl. az aznapi úrvacsorás istentisztelet is beleszámít").

**Következmény:** A hivatalos űrlap 18 rovatából 9-et nem lehet kitölteni. A lelkésznek a Karácsony I. délelőtti és délutáni jelenlétét kézzel kell szétválasztania a Kartotéka összevont számából — amit a rendszer már nem tud visszabontani.

#### 🔴 SÚLYOS — A templomlátogatási átlag számítási alapja eltér: nincs „de.2 / du.2" fogalom

**Hivatalos:** 'Sugo_lelkeszi jelenteshez' D79/D80 (egyszerű változat) kimondja: „Ha egy gyülekezetben egy vasárnap vagy ünnepnap délelőtt, vagy délután több istentisztelet van, akkor az átlagot nem az istentiszteletek számával számoljuk, hanem a vasárnapok, ünnepnapok számával… Ha a vasárnapok számával osztunk, akkor feleződik ebben az esetben a templomlátogatók átlaga." A megvalósítás a munkanaplóban a 'DeDu' lista negyedik-második eleme: 'Sugo a munkanaplohoz' C58: „a második, vagy sokadik istentisztelethez a "de.2" vagy "du.2" lehetőségek kell beírni" — ezeket az Adatlap P-képletei ($O$2='Du.', $O$3='De.2', $O$4='Du.2') a de./du. ághoz ADJÁK HOZZÁ, de az alkalom-számláló (P51) csak az $O$3-at veszi be, így egy vasárnap egy alkalomnak számít.

**Kartotéka ma:** apps/web/lib/constants/worklog.ts:21-25 — a `NAPSZAK_OPTIONS` csak 'de' / 'du' / 'este'; nincs 'de.2' / 'du.2'. Az átlag: lelkeszi-jelentes-actions.ts:186-188 `atlagJelenlet(h) = h.jelenletOssz / h.jelenletesDb` — a JELENLÉTET RÖGZÍTŐ ALKALMAK számával oszt, nem a vasárnapok számával.

**Következmény:** Kettős torzítás. (1) Ahol egy vasárnap két délelőtti istentisztelet van (9 és 11 óra), ott a Kartotéka átlaga PONTOSAN FELE az EREK-szabály szerintinek — a hivatalos súgó ezt kifejezetten hibaként nevezi meg. (2) Ha egy alkalomnál nincs beírva a jelenlét, a Kartotéka azt kihagyja az osztóból, az EREK-tábla viszont nem — így a Kartotéka átlaga FELFELÉ torzít. A II.1b/II.2b/II.3b/II.6b/II.7b/II.8b/III.6 és a II.13 rubrika mind érintett.

#### 🔴 SÚLYOS — A bibliaóra-fajták: hivatalosan 7 automatikus rubrika, a Kartotékában 2 auto + 3 kézi + 2 nem létező

**Hivatalos:** Adatlap 93–101 az egybeépítettben MIND auto: 93 felnőtt bibliaóra (N93='Felnőtt bibliaóra'), 94 ifjúsági (N94='Ifj. vagy IKE bibliaóra'), 95 presbiteri (N95='Presbiteri bibliaóra'), 96 nőszövetségi (N96='Nőszöv. bibliaóra'), 97 házasok (N97='Házasok bibliaórája'), 99 Más bibliaóra 1, 101 Más bibliaóra 2. Az 59. sor („e. bibliaórák") ezek ÖSSZEGE: P59='=SUM(P93:P101)'. A hét típus a 'Szolgálat jellege' lenyíló 7–13. eleme ('Sugo a munkanaplohoz' B22–B28).

**Kartotéka ma:** types.ts:150-172 — III.1 (felnőtt) és III.2 (ifjúsági) `auto: true`; III.16 presbiteri, III.17 nőszövetségi, III.18 házaspári `auto: false` (kézi); a „Más bibliaóra 1/2" rubrika egyáltalán NEM létezik a katalógusban. A II.8a („Bibliaóra (felnőtt + ifjúsági) — alkalmak") csak a két auto-fajtát összegzi (lelkeszi-jelentes-actions.ts:598-602, 664).

**Következmény:** A hivatalos II.1.e („e. bibliaórák") sorba a Kartotéka a felnőtt+ifjúsági alkalmakat írja, miközben az EREK-tábla ide hét fajtát összegez — a beküldött szám következetesen ALACSONYABB lesz. A presbiteri/nőszövetségi/házasok bibliaórája kézzel is bevihető, de a III.16/III.18 mellé (a III.17-tel ellentétben) még javaslat-sor sincs. A „Más bibliaóra 1/2" fajtát a lelkész sehol nem tudja megnevezni és megszámolni.

#### 🔴 SÚLYOS — Katekézis: hivatalosan 4 automatikus rubrika a Katekezis lapról, a Kartotékában 1 összevont auto + 3 kézi

**Hivatalos:** Adatlap 161 „Ebből vallásórára jár átlag egy alkalommal" (P161='=SUMIF(Katekezis!AC4:AC5000,P1&N161&"*",Katekezis!G4:G5000)', osztó P162), 162 „Hány csoportban folyt a vallásóra?" (P162='=COUNTIF(Katekezis!$AC$4:$AC$8000,P1&$N163&" 1. csoport")'), 163 „Hány vallásóra volt az év folyamán?", 164 „Hány gyermekistentisztelet (liturgikus szolgálattal)", 165 „Hány vasárnapi iskola". A Katekezis lap lenyílója (AA3:AA13): Vallásóra 1.–5. csoport, Elsőéves konf. felkészítő, Másodéves konf. felkészítő, Gyermekistentisztelet, Vasárnapi iskola, VBH – Vakációs Bibliahét, Egyéb foglalkozás. A 'Sugo a munkanaplohoz' C70 külön kiköti: az átlagot NEM az összes vallásóra számával, hanem a „Vallásóra 1. csoport" óráinak számával kell osztani.

**Kartotéka ma:** types.ts:181-196 — V.3 „Katekézis-alkalmak száma az évben" EGYETLEN auto-mező, forrása lelkeszi-jelentes-actions.ts:562 `if (kategoria === 'katekezis') katekezisDb += 1`, vagyis a WORKLOG_TYPES.katekezis MIND A NYOLC típusa egybe (Ifjúsági bibliaóra (IKE), Hittan, Vallásóra, Kátéóra, Konfirmáció előkészítő, Ifjúsági óra, Gyermek foglalkozás, Egyéb katekézis). V.1 vallásórás gyermekek, V.2 csoportok száma, V.9 gyermekistentisztelet, V.10 vasárnapi iskola — MIND `auto: false`. Csoport-fogalom (1.–5. csoport) nincs a munkanaplóban.

**Következmény:** A hivatalos V. fejezet négy automatikus rovatából egy sem töltődik helyesen: a V.3 összevont szám nem felel meg a 163. sor „vallásórák száma" kérdésének (beleszámol az IKE-bibliaóra és a konfirmáció-előkészítő is, ami az EREK szerint MÁS rubrikákba tartozik), a gyermekistentisztelet és a vasárnapi iskola pedig kézi marad. A csoport-alapú átlagszabály nincs implementálva.

#### 🔴 SÚLYOS — II.9 „Kazuáliák és egyéb szolgálatok" összekeveri a hivatalos f) és g) sort — és átfed a kézi II.10-zel

**Hivatalos:** Adatlap 60 „f. kazuáliák és felkészítők" = SUM(P14:P17, P46:P47, P230:P232) = F./N. keresztelő + F./N. temetés + Azonos/Vegyes esketés + Keresztelői felkészítő + Jegyesbeszélgetés + Virrasztó. Adatlap 61 „g. más alkalmak" = SUM(P102:P104, P255:P257) = Vallásos ünnepély + Szeretetvendégség + Imahét + Úrvacsora templomban + Betegúrvacsora + Egyéb szolgálat. A Sugo D76 (egyszerű) is ezt írja: „Keresztelések, házasságkötések és felkészítőik valamint a temetések és virrasztók száma kerül ide."

**Kartotéka ma:** types.ts:137-139 — II.9 `auto: true`, II.10 „Más alkalmak" `auto: false`. A II.9 forrása (lelkeszi-jelentes-actions.ts:627-629) az `egyeb` oszlop, amit a print-columns.ts:168 `EGYEB_TYPES = new Set(['Keresztelő','Esketés','Temetés','Konfirmáció','Imahét','Egyéb szolgálat'])` és a :249 fallback („Ismeretlen / nem-istentiszteleti jellege → Egyéb szolgálat") tölt.

**Következmény:** Az 'Imahét' és az 'Egyéb szolgálat' az EREK szerint a g) sorba tartozik, a Kartotékában viszont az f)-nek megfelelő II.9-be kerül — ráadásul az ismeretlen jellegű sorok is ide esnek. Közben a g)-nek megfelelő II.10 KÉZI mező, amibe a lelkész ugyanezeket az alkalmakat is beírhatja: kettős számolás egy aláírt nyomtatványon. A 'Konfirmáció' viszont a hivatalos listán sehol nem kazuália.

#### 🟠 KÖZEPES — A munkanapló „Szolgálat jellege" lenyílója normatív és 37 tételes — a Kartotéka listája 17 tételes és MÁS

**Hivatalos:** Munkanaplo_Lelkeszi_jelentes.txt, 'Szolgalati_alkalmak' lap: `type=list f1='$BA$3:$BA$39' sqref=F4:F8000`; a 37 tétel a 'Sugo a munkanaplohoz' B16–B52-ben tételesen: 1 Vasárnapi i.t., 2 Ünnepi i.t., 3 Bűnbánati i.t., 4 Hétköznapi i.t., 5 Úrvacsora templomban, 6 Betegúrvacsora, 7 Felnőtt bibliaóra, 8 Ifj. vagy IKE bibliaóra, 9 Presbiteri bibliaóra, 10 Nőszöv. bibliaóra, 11 Házasok bibliaórája, 12 Más bibliaóra 1, 13 Más bibliaóra 2, 14 F. keresztelő, 15 N. keresztelő, 16 Keresztelői felkészítő, 17 F. temetés, 18 N. temetés, 19 Virrasztó, 20 Azonos esketés, 21 Vegyes esketés, 22 Jegyesbeszélgetés, 23 Digitális alkalmak, 24 Imahét, 25–27 Húsvét I–III. it., 28–30 Pünkösd I–III. it., 31–33 Karácsony I–III. it., 34 Vallásos ünnepély, 35 Szeretetvendégség, 36 Presbiteri felkészítő, 37 Egyéb szolgálat. A B29/B30 és B32/B33 külön kiköti: keresztelőnél és temetésnél SZEMÉLYENKÉNT külön sor kell.

**Kartotéka ma:** apps/web/lib/constants/worklog.ts:42-46 — `WORKLOG_TYPES.szolgalat` 17 tétel: Istentisztelet, Igehirdetés, Úrvacsora, Bűnbánati istentisztelet, Bibliaóra, Imaóra, Esti áhítat, Alkalmi istentisztelet, Imahét, Presbiteri gyűlés, Nőszövetségi összejövetel, Vallásos ünnepély, Keresztelő, Esketés, Temetés, Konfirmáció, Egyéb szolgálat.

**Következmény:** 22 hivatalos szolgálat-típus egyáltalán nem rögzíthető (F./N. keresztelő és temetés, Azonos/Vegyes esketés, Keresztelői felkészítő, Jegyesbeszélgetés, Virrasztó, Betegúrvacsora, Presbiteri bibliaóra, Nőszöv. bibliaóra, Házasok bibliaórája, Más bibliaóra 1/2, Digitális alkalmak, Szeretetvendégség, Presbiteri felkészítő, valamint az ünnep-típusok). Emiatt az egybeépített változat 64 auto-mezőjéből legalább 30 elvi lehetetlenség a mai adatmodellben — nem szoftverhiba, hanem hiányzó törzsadat.

#### 🟠 KÖZEPES — „Presbiteri felkészítő" vs „Presbiteri gyűlés" — a Kartotéka olyan rubrikát számol, ami a 2026-os űrlapon nincs, és nem számolja azt, ami van

**Hivatalos:** Adatlap 112 „Hány presbiteri felkészítőt tartottak az év folyamán?" — az egybeépítettben AUTO, N112='Presbiteri felkészítő' (a lenyíló 36. eleme). Az Adatlap 109–116 sorai közt NINCS „presbiteri gyűlések száma" kérdés; a 116. sor „Hány közgyűlést tartottak az év folyamán?" (kézi mindkét változatban).

**Kartotéka ma:** types.ts:159 — III.10 „Presbiteri gyűlések száma" `auto: true`; forrása a `presbiteri` oszlop, amit a print-columns.ts:167 `PRESBITERI_TYPES = new Set(['Presbiteri gyűlés','Konfirmáció előkészítő'])` tölt. III.12 „Egyházközségi közgyűlések száma" kézi. „Presbiteri felkészítő" rubrika nincs.

**Következmény:** A hivatalos 112. rovat üresen marad. A Kartotéka III.10 mezője viszont a konfirmáció-előkészítőket is beleszámolja a presbiteri gyűlésekbe — ez a szám akkor is torz, ha a lelkész mégis felhasználná valahol.

#### 🟠 KÖZEPES — „Rendszeres" vs „alkalmi" hétköznapi istentisztelet: a Kartotéka nem tud különbséget tenni

**Hivatalos:** 'Sugo a munkanaplohoz' D19 a 4. lenyíló-tételhez ('Hétköznapi i.t.'): „A rendszeresen tartott hétköznapi istentiszteletek nyilvántartására szolgál. Az alkalmi hétköznapi istentiszteletek nem kerülhetnek ide." Ugyanez az egyszerű űrlap súgójában D71/D72: „A rendszeresen tartott hétköznap délelőtti istentiszteletek… Az alkalmi hétköznapi istentiszteletek nem kerülhetnek ide." Az alkalmiak a g) sorba („más alkalmak") tartoznak.

**Kartotéka ma:** apps/web/lib/worklog/print-columns.ts:234-245 — minden istentiszteleti típus, ami nem ünnepnapra és nem vasárnapra esik, feltétel nélkül a `hetkoznapi` oszlopba kerül (`return { column: 'hetkoznapi', slot: null }`). Nincs 'rendszeres' jelölő a munkanaplo táblán.

**Következmény:** A hivatalos II.1.c rovat (rendszeres hétköznapi istentiszteletek) felfelé torzul minden alkalmi hétköznapi szolgálattal, és ugyanezek hiányoznak a g) „más alkalmak" sorból. A hiba az átlagjelenlétre (II.6b) is átterjed.

#### 🟠 KÖZEPES — Az imaheti és úrvacsorai átlag osztója eltér a hivatalos képlettől

**Hivatalos:** Adatlap 106 (egybeépített): C106='=IF(P104<>0,ROUND(SUM(P105:P106)/P104,1),0)' — az IMAHETI ALKALMAK számával (P104) oszt. Adatlap 90/91: C90='=IF(P89<>0,ROUND(P90/P89,1),0)' — az ÚRVACSORAOSZTÁSOK számával oszt, és az egyszerű változat súgója D105 pontosít: „Az úrvacsoraosztások száma azon ünnepek számát jelenti, amikor volt úrvacsoraosztás, nem pedig úrvacsorás istentiszteletek számát. Pl. ha húsvét I. napján van úrvacsoraosztás de. 9, de. 11 és du. 3 órakor, és húsvét II. napján is, akkor ez nem négy alkalmat jelent, hanem egyet, a húsvéti úrvacsorát."

**Kartotéka ma:** lelkeszi-jelentes-actions.ts:186-188 és :667-668 — III.6 = `atlagJelenlet(imahet)` (a jelenlétet rögzítő alkalmak átlaga); II.12 `uvOsztasDb` = MINDEN olyan naplósor, ahol az `Úrvacsora` jelleg vagy `uv_templomban`/`uv_betegnel` szerepel — vagyis alkalmanként, nem ünnepenként. II.13 = `uvResztvevoOssz / uvResztvevosDb`.

**Következmény:** A II.12 („Hány alkalommal volt úrvacsoraosztás") a hivatalos definícióhoz képest többszörös számot ad (a példa szerint 4 helyett 1 lenne a helyes), és emiatt a II.13 átlag arányosan ALACSONYABB. Az imaheti átlag (III.6) ott tér el, ahol egy imaheti alkalomnál nincs beírva a jelenlét.

#### 🟠 KÖZEPES — II.11 „Digitális alkalmak" és III.4 „Szeretetvendégségek" kézi maradt, pedig az egybeépítettben AUTO

**Hivatalos:** Adatlap 62 „h. digitális alkalmak" — egybeépítettben C62='=P62', N62='Digitális alkalmak' (lenyíló 23. eleme); Sugo D78 (egyszerű): „A kizárólag digitális alkalmak nyilvántartására. A közvetített alkalmakat nem kell ide beírni." Adatlap 103 „Hány szeretetvendégség volt?" — egybeépítettben C103='=P103', N103='Szeretetvendégség' (lenyíló 35. eleme).

**Kartotéka ma:** types.ts:139 (II.11 `auto: false`) és :153 (III.4 `auto: false`). Egyik jellegre sincs munkanapló-típus a WORKLOG_TYPES-ban. A III.4/II.10 mellé a 6. körben KÜLÖNLEGES ALKALOM alapú javaslat-sor került (lelkeszi-jelentes-dialog.tsx:76-79), a II.11 mellé semmi.

**Következmény:** Aki vezeti a munkanaplót, ezt a két rubrikát mégis kézzel viszi fel — pontosan az a kettős adatbevitel, amit az egybeépített űrlap megszüntetne.

#### 🟠 KÖZEPES — A JELENTES_MEZOK katalógus nem az IT 65/2025 (2026-os) űrlapból készült — az I. fejezetben több hivatalos rovatnak nincs megfelelője

**Hivatalos:** Valtozasok_2026.txt: „Az Igazgatótanács a 2025. október 8-án tartott ülésén 65/2025. szám alatt elfogadta az új lelkészi jelentést… Az új lelkészi jelentés 2026-tól kötelező." Az Adatlap I. fejezetének olyan sorai, amiknek a katalógusban nincs párja: 20 „Milyen felekezetből:" és 23 „Milyen felekezetbe:" (szöveg), 28/29 „Kiköltözött külföldre: férfi/nő", 33–37 „Gyülekezet lélekszámában jelentős (10 személynél több), MÁS nemzetiségű egyháztagok száma: Román / Német / Roma / Más (megnevezni) / más tagok száma", 41 „Családok száma az előző évben", 48/49 „Azonos nemzetiségű / Nem azonos nemzetiségű" (házasságkötésnél).

**Kartotéka ma:** types.ts:44-48 fejléc-komment: „A hivatalos éves lelkészi jelentés teljes mező-katalógusa (minta-PDF + tervdoc A.2 szerkezete szerint)" — tehát egy KORÁBBI minta-PDF alapján. A 33–37. sor helyett egyetlen I.18 „Nemzetiségünkhöz tartozók lélekszáma" van, ami fogalmilag az ELLENKEZŐJE a hivatalos kérdésnek (az EREK a MÁS nemzetiségűeket kérdezi).

**Következmény:** A 2026-tól kötelező űrlap több rovatát a Kartotéka nem tudja kitölteni, egy rovatot (I.18) pedig fordított jelentéssel. Ez a nyomtatvány-generátorra (print.ts) is átterjed, mert az a JELENTES_MEZOK sorrendjében rajzol. A teljes I–X. katalógus tételes újraszinkronizálása szükséges — ez önmagában külön munkatétel.

#### ℹ️ INFÓ — AZ EGYSZERŰ ŰRLAP SÚGÓJA HIBÁS a keresztelés/temetés soroknál (hivatalos fájl-hiba)

**Hivatalos:** Lelkeszi_jelentes.txt (EGYSZERŰ változat), 'Sugo_lelkeszi jelenteshez': D30='Az adatokat a digitális munkanaplóból, a "Szolgálati_alkalmak" lapról veszi át. ("F. keresztelő" szolgálatok száma)', ugyanígy D31, D32, D33. Ugyanakkor ebben a fájlban az 'Adatlap' C14:C17 cellája ÜRES (kézi), és a P14:P17 segéd-cellák sincsenek benne. A súgó tehát olyan munkanaplóra hivatkozik, ami ebben a munkafüzetben nincs. (Az esketésnél viszont helyes: D62='Egész szám írható be.') Ugyanebben a fájlban a rejtett 230–257. segéd-sorok képletei `#REF!`-re mutatnak (pl. P230='=SUM(COUNTIF(#REF!,…))') — a munkanapló-lapok törlésének maradványai; ezek semmit nem táplálnak, de hibaértéket adnak.

**Kartotéka ma:** A Kartotéka I.2a/b/c (keresztelt) és I.3a/b/c (temetett) mezője `auto: true`, forrása az ANYAKÖNYV (keresztseg / temetes tábla + szemely.ferfi), nem a munkanapló — lásd lelkeszi-jelentes-actions.ts:12-16 fejléc-komment.

**Következmény:** A Kartotéka megoldása itt JOBB, mint bármelyik hivatalos változat (az anyakönyv a hiteles forrás, nem a munkanapló), de tudni kell: aki az EGYSZERŰ EREK-táblát tölti, azt a súgó félrevezeti. Ha a Kartotéka valaha átvenné a munkanapló-alapú számolást ezekre, kettős forrás keletkezne.

#### ℹ️ INFÓ — A hivatalos egybeépített tábla 85–88. sorának osztója elcsúszott (EREK-oldali képlethiba)

**Hivatalos:** Munkanaplo_Lelkeszi_jelentes.txt, 'Adatlap': C85='=IF(C73<>0,ROUND(P85/C73,1),0)', C86='=IF(C74<>0,ROUND(P86/C74,1),0)', C87='=IF(C75<>0,ROUND(P87/C75,1),0)', C88='=IF(C76<>0,ROUND(P88/C76,1),0)'. A 85–88. sor a HÉTKÖZNAPI és a BŰNBÁNATI átlagjelenlét, aminek a helyes osztója az alkalom-szám lenne (C55/C56, illetve C57/C58) — a képlet viszont C73–C76-ra mutat, ami a „Húsvét_I. de./du." és „Húsvét_II. de./du." RÉSZTVEVŐ-száma. A hiba mind a 10 évoszlopban azonos módon ismétlődik (D74, E74, …), tehát nem elgépelés, hanem 18 sornyi elcsúszás. Az egyszerű változatban ez a 4 cella kézi, tehát ott nem jelentkezik. Ugyanitt: a C189 („a. Előző évi egyenleg") cellában beragadt 123456789 teszt-érték van.

**Kartotéka ma:** lelkeszi-jelentes-actions.ts:660-663 — II.6b/II.7b a helyes alkalomszámmal oszt (`atlagJelenlet`).

**Következmény:** Ha a Kartotéka helyesen számol, a hétköznapi és bűnbánati átlagjelenlét ELTÉR az EREK Excel által kiadott számtól. Ezt a lelkésznek/esperesnek tudnia kell, mielőtt „hibának" minősítené a Kartotéka számát. Javaslat: az EREK felé jelezni.

#### ℹ️ INFÓ — JÓ HÍR: a nyomtatott végeredmény a két változatban azonos — egyetlen sablon elég

**Hivatalos:** A 'Jelentes' lap (A1:AF219) normalizált diffje a két fájl közt EGYETLEN sort ad: N18='v 1.0a' (egyszerű) vs N18='v 1.0b' (egybeépített). Minden más cella — cím-képletek, fejezet-szövegek, az Adatlapra mutató hivatkozások — bit-azonos.

**Kartotéka ma:** apps/web/lib/lelkeszi-jelentes/print.ts (350 sor) — egyetlen A4 álló nyomtatvány-generátor, a JELENTES_MEZOK sorrendjében.

**Következmény:** A kettősség megvalósításához NEM kell két nyomtatvány-sablon. Elég egy gyülekezet- (vagy lelkész-) szintű kapcsoló, ami a JELENTES_MEZOK `auto` felosztását futásidőben eldönti, plusz a print.ts változatlan marad. Ez lényegesen kisebb munka, mint amekkorának látszik.

### Ami teljesen hiányzik

- Nincs éles DB-hozzáférés (a memória szerint a Kartotéka Supabase-hez nincs MCP), ezért nem tudom, hány gyülekezetnek van egyáltalán 2026-os munkanapló-sora, és hány lelkészi jelentés készült már 0-kkal. Ezt az 1. és 2. SQL deríti ki.
- Az xlsx-ekből csak szöveges kivonat állt rendelkezésre: a cella-VÉDELEM (zárolt/feloldott cella) és a feltételes formázás nem látszik. Azt, hogy az egyszerű űrlapon egy cella tényleg kézzel írható, a DATA VALIDATIONS blokkból és a súgó-szövegből rekonstruáltam — a lap-védelmet nem tudtam ellenőrizni.
- A 'Nyomtathato_munkanaplo' lap (A1:AG412) és a Kartotéka nyomtatott munkanaplójának (lib/worklog/official-journal.ts, print-columns.ts) oszloponkénti összevetése nem része ennek a felmérésnek — a 18. feladat tárgya.
- A desktop (Tauri) oldalt nem vizsgáltam: nem tudom, van-e ott lelkészi jelentés modul, és ha igen, ugyanezt az auto/kézi felosztást használja-e.
- A 'congregations' tábla megjelenítendő név-oszlopát (name vs nev_hu) az SQL-ekben c.name-ként vettem fel a memória alapján (name = hivatalos név). Ha a lekérdezés oszlophibát ad, cseréld nev_hu-ra.
- A munkanaplo.idopont oszlop pontos típusát (date / timestamptz / text) nem ellenőriztem éles sémán, ezért az SQL-ekben left(idopont::text,10) alakot használok, ami mindhárom típusnál működik.
- A III.16 (presbiteri bibliaóra) és III.18 (házaspári bibliaóra) mellé miért nem került javaslat-sor, csak a III.17 mellé — a MUNKANAPLO_JAVASLAT_MEZOK szándékosan szűk, de a döntés indoklása a másik két rubrikára nincs leírva.

> **Megjegyzés:** MÓDSZERTANI JEGYZET a bizonyítás módjáról: a két hivatalos munkafüzet 'Jelentes' és 'Adatlap' lapját cellánként párhuzamosítottam (a segéd-script a scratchpadben: parse2.py, a kimenet adatlap_cmp2.txt), a python-objektum-címeket normalizálva, hogy a diff ne adjon álpozitívot. Innen jött a „a Jelentes lap egyetlen eltérése az N18 verzió-jelölő" és a „pontosan 64 C-cella tér el" állítás. A 'Sugo_lelkeszi jelenteshez' lap diffje független megerősítés ugyanerre: a súgó-szövegek pontosan azoknál a soroknál váltanak 'kézzel beírni' → 'a munkanaplóból veszi át' irányba, ahol az Adatlap C-cellája képletet kap.

A KETTŐSSÉG MEGVALÓSÍTÁSÁNAK ALAKJA (nem építettem meg, csak a felmérésből következik): mivel a nyomtatott 'Jelentes' lap a két változatban azonos, elég EGY kapcsoló — pl. bealitas/congregation szintű `vezet_munkanaplot boolean` —, ami a JELENTES_MEZOK `auto` felosztását futásidőben eldönti. Két csapdára kell vigyázni, mindkettő ma is a kódban van: (1) a `mezoErtek` prioritása `felulirasok > auto > kezi`, tehát ha egy mező auto:true→false-ra vált, a korábbi auto-érték eltűnik, de a felülírás megmarad; (2) a `saveLelkesziJelentes` `keziMezok`/`autoMezok` szűrője a katalógus `auto` mezőjéből épül — ha az futásidőben változik, a mentés MÁS szűrőt használ, mint amivel az érték bekerült, és NÉMÁN eldobhat már beírt adatot. Ugyanez a veszély a `snapshot`-ra: a véglegesített jelentések auto/kezi bontása a régi felosztás szerint van befagyasztva. A types.ts:243-255 kommentje (MUNKANAPLO_JAVASLAT_MEZOK) pontosan ezt a hibaosztályt írja le már ma is — érdemes ugyanazt a gondolatmenetet alkalmazni a kapcsolóra.

ÖSSZEGZŐ SZÁM a kérdésre („mit kell kézzel beírni az egyszerű űrlapon?"): 64 cellát. Ebből a Kartotéka ma 33-at tud automatikusan (II.1a/b/c, II.2a/b/c, II.3a/b/c, II.4a/b/c, II.5a–i, II.6a/b, II.7a/b, II.8a/b, II.9, II.12, II.13, II.14, III.1, III.2, III.3, III.5, III.6, III.7, III.8, V.3 — de közülük 7 fogalmilag eltérő tartalommal, lásd a high-eket), 31-hez pedig nincs adatforrása (a bibliaóra-fajták, a de./du. bontások, a 9 ünnepnap du.-ága, a presbiteri felkészítő, a digitális alkalmak, a szeretetvendégség, a katekézis 4 rubrikája, az úrvacsorázók nemenkénti bontása).

---

## 4. Sugo.pdf — a teljes hivatalos könyvelési munkafolyamat (éves + havi ciklus), és az „A" (nagy) / „B" (kis) gyülekezet-változat kezelése a Kartotékában

A Sugo.pdf (Sugo.txt) a hivatalos EREK-segédlet használati leírása: két munkafüzet (Adatok_2026.xlsx = kitölthető, Kimutatasok_2026.xlsx = csatolással feldolgozó), és egy szigorú, ismétlődő ciklus. ÉV ELEJÉN: egyházmegye neve a Költségvetés lapra (enélkül 2026-tól nincsenek költségvetési tételek a lenyílókban — Valtozasok_2026), egyházközség neve, előző évi készpénzegyenleg a Kassza!H6-ba és számlánként a banki előző évi egyenleg, majd a költségvetés kitöltése a Szamadas lapon és nyomtatása a Koltsegvetes lapról presbiteri határozattal + egyházmegyei iktatószámmal + esperesi aláírással. FOLYAMATOSAN: a kassza naponta, a bankszámlák KIZÁRÓLAG a kivonat alapján; minden kassza↔bank és bank↔bank mozgást KÉTSZER kell könyvelni (300.xx/400.xx kódok), amit a Hibák lap figyel; minden kiadás mellé kötelező kiadási kísérőív. HAVONTA (2026-os rend): havi kasszakönyv + havi banki kivonat lefűzése, a Főkönyv (Registru Jurnal) kötelező nyomtatása; a napi kasszakönyvet és a napi extras-t NEM kell nyomtatni. ÉV VÉGÉN: valutás számlák átértékelése a dec. 31-i BNR-árfolyammal (103.04 nyereség / 203.03 veszteség), a Számadás zárása úgy, hogy a záróegyenleg (Sold la finele anului) PONTOSAN egyezzen a Casa + Banca bontással (ez a Hibák lap 1. sz. hibajelzése), a tartozások és kintlevőségek (Datorii / Creanţe) felvezetése, végül a banknapló Jan_Dec éves nyomtatása és a csoportnapló nyomtatása. A Kartotéka ennek a láncnak a nagy részét lefedi, sőt több ponton erősebb (belső mozgás automatikus kettős könyvelése + párosítás-figyelő, év-zár fail-closed őre, banki import duplikáció-védelem, automatikus évátvitel, FX-átértékelés), de az ÉV VÉGI HIVATALOS ÍV hiányos (Casa/Banca bontás „—", nincs Datorii/Creanţe blokk), a hivatalos 1. sz. hibajelzés nincs implementálva, a törvényi készpénz-korlátok sehol nincsenek ellenőrizve (a Súgó két helyen rossz számot ír), és a nyomtatvány fejlécéből hiányzik az egyházmegye és az egyházkerület neve. Az „A"/„B" változat 2026-ban KAPACITÁS-különbség (az „A" 20 bankszámla-lapot A–T és 10 000 kassza-sort ad; mindkettő ugyanazt a tételrendet tartalmazza) — ezt a Kartotéka korlátlan bankszámla- és sorszámával tartalmilag lefedi, tehát gyülekezet-méret szerinti eltérő könyvelésre NINCS szükség; ami hiányzik, az a nyomtatványra írt verzió/változat-jelölés (a hivatalos íven „v 7.4a").

### Eltérések

#### ⛔ BLOKKOLÓ — Az éves Számadás záró blokkja hiányos: nincs Casa/Banca bontás, és teljesen hiányzik a Tartozások (Datorii) + Kintlevőségek (Creanţe) rész

**Hivatalos:** Adatok_2026.txt, 'Szamadas' lap: B213='Sold la finele anului\nPénztári és banki egyenleg az év végén \n(1+52-112)', B214='Casa ', B215='Banca ', B216='Datorii\nTartozások (117+ … +127)' (B217–B227 alsorok), B228='Creanţe\nKintlevőségek (129 + … + 133)' (B229–B233 alsorok), B234='Sold\nZáróegyenleg\n(113-116+128)'. A Penzugyi_vizsgalat.txt kifejezetten kéri: „Év végi követelésekre ( be nem érkezett épület-, föld-, terem bérek ) az ügyfelektől vissza kapott, aláírt elismerési bizonylatok ( Extras de cont confirmat)".

**Kartotéka ma:** packages/ui-app/src/finance/budget-reporting.ts:1043-1075 (`buildSzamadasExtraRows`): csak 3 sort nyomtat — a záróegyenleget kiszámolja, de a Casa és a Banca sorba a kód szándékosan `—` jelet ír („itt nincs oldalankénti (kassza vs. bank) tény-adat"). A Datorii/Creanţe blokk és a végső Sold (113-116+128) sor sehol nem szerepel; a `szamadasIvCellak` (uo. 267-276) csak az 1xx és 2xx kódokat engedi a papírra, tartozás/kintlevőség tárolására pedig nincs tábla a sémában.

**Következmény:** Az aláírt és beküldött hivatalos Számadás két kötelező adatot nem tartalmaz. A számvevő/esperesi hivatal az összesítéskor a Casa+Banca bontást ellenőrzi (ezt hasonlítja a következő év nyitójához) — enélkül a számadás visszaküldhető. A tartozásokat és kintlevőségeket a lelkésznek kézzel, a nyomtatványon kívül kell pótolnia.

#### ⛔ BLOKKOLÓ — A hivatalos „1. számú hibajelzés" (számadási záró ⇄ kassza + bank egyenleg) nincs implementálva — a felület kifejezetten megengedi az eltérést

**Hivatalos:** Adatok_2026.txt, 'Hibak' lap B1: `=IF(ROUND(Szamadas!G213,2)<>ROUND(SUM(Szamadas!G214:G215),2), Y3&Y4&Y5&Y6&" lej","")`, Y1='Figyelem! ', Y2=' hibajelzés a "Hibák" munkalapon!'. Sugo.txt 337-340: „Egy másik képlet a költségvetési egyenleget figyeli: ha valahol nem írtunk költségvetési tételt egy bevétel vagy kiadás mellé, akkor a kassza és a bankszámlák egyenlegének az összege nem fog találni a számadási egyenleggel (előző évi egyenleg + bevételek - kiadások). Erre a hibára az 1. számú hibajelzés figyelmeztet."

**Kartotéka ma:** packages/ui-app/src/finance/AccountingTab.tsx:486-491 — a képernyőn álló magyarázat: „A lenti terv–tény táblázat csak a számadási kódra könyvelt tételeket összegzi, ezért ott kis eltérés lehetséges (pl. kód nélküli vagy devizás tétel)." A `finalizeAccounting` (apps/web/app/(dashboard)/penzugy/actions.ts:3066-3320) a pillanatkép-aggregáláskor sem veti össze a záró számadási egyenleget a kassza+bank egyenleggel — csak a lekérdezési hibára áll meg.

**Következmény:** A hivatalos rendszerben ez BLOKKOLÓ hiba (a számadás „hibás" felirattal jelenik meg, Szamadas!B84), a Kartotékában viszont csak egy magyarázó mondat — a lelkész úgy véglegesíthet és küldhet be egy évet, hogy a papírja nem egyeztethető a fizikai kasszával és a bankkivonattal.

#### 🔴 SÚLYOS — A Költségvetés / Számadás borítóján nincs egyházmegye-név és egyházkerület-sor — a 2026-os változás pont ezt élesíti ki

**Hivatalos:** Adatok_2026.txt, 'Koltsegvetes' lap: D78=' ← Ide kell beírni az egyházmegye nevét… Ha nincs beírva az egyházmegye neve, nem lesznek elérhetőek a költségvetési tételek.'; B87=`=IF(ISERROR(VLOOKUP(B78,X1:Y24,2,FALSE))=TRUE,"",VLOOKUP(B78,X1:Y24,2,FALSE))` → 'ERDÉLYI REFORMÁTUS EGYHÁZKERÜLET'; B88=`=UPPER(B78&V3)` → pl. 'KÉZDI-ORBAI REFORMÁTUS EGYHÁZMEGYE'; B89='Egyházmegyei\niktatószám', G89='Esperes aláírása'. Valtozasok_2026.txt 9-12: „A költségvetési tételek az egyházmegye neve beírása után lesznek elérhetőek a lenyílókban."

**Kartotéka ma:** packages/ui-app/src/finance/budget-reporting.ts:566 — a boríték fixen `<div class="cv-entity">REFORMÁTUS EGYHÁZMEGYE</div>` szöveget ír, NÉV NÉLKÜL, és az egyházkerület sora egyáltalán nincs a nyomtatványon. Az adat rendelkezésre áll (`congregations.egyhazmegye`, `congregations.diocese_id` → `dioceses`), és a nyugta-sablon már helyesen használja: apps/web/components/finance/chitanta-print-template.tsx:209 és :216.

**Következmény:** A beküldött, aláírt költségvetés és számadás fejlécéből hiányzik a beküldő azonosítása (melyik egyházmegye, melyik egyházkerület). Az esperesi hivatal iktatásakor ez azonnal feltűnik, és a Kartotékás nyomtatvány „nem olyan, mint a hivatalos".

#### 🔴 SÚLYOS — A törvényi kasszaplafon (50 000 lej) nincs élő ellenőrzés alatt — csak a Súgóban szerepel

**Hivatalos:** Adatok_2026.txt, 'Kassza' lap I2: `=IF(H3>50000,"Az egyenleg meghaladta a kasszaplafont. Le kell tenni a készpénzt a bankszámlánkra!!!","")` — vagyis a hivatalos munkafüzet MINDEN beírás után, a képernyőn, azonnal jelez. Valtozasok_2026.txt 37-39: „A pénztárban lévő készpénz összege nem haladhatja meg az 50 000 (ötvenezer) lejt. Amennyiben ezt az összeget meghaladja …, a többletet be kell helyezni a bankba 3 napon belül."

**Kartotéka ma:** Az 50 000-es küszöb a teljes pénzügyi kódban CSAK súgószövegként fordul elő: apps/web/components/finance/penzugy-help.tsx:497 és :1050. A Kassza fülön (packages/ui-app/src/finance/CashbookTab.tsx, apps/web/components/finance/cashbook-tab.tsx) és a Monetár-widgetben nincs sem küszöb-konstans, sem figyelmeztetés (grep: „plafon|50000|50 000" → 0 találat ezekben a fájlokban).

**Következmény:** A lelkész átlépheti a kasszaplafont anélkül, hogy bármi jelezné; a 3 munkanapos befizetési határidő némán lejár. Ez pénzügyi ellenőrzésen közvetlenül szankcionálható tétel, és a hivatalos Excel ezt megelőzte volna.

#### 🔴 SÚLYOS — A Súgó két helyen ROSSZ előleg-korlátot ír (5000 lej), miközben ugyanaz a fájl máshol helyesen 1 000 lejt mond

**Hivatalos:** Valtozasok_2026.txt 44-47: „Nem adhatunk ki előlegként elszámolásra (decont) 1 000 lejnél többet készpénzben vásárlási célra. Ezt a felső értéket naponta és személyenként kell értelmezni."

**Kartotéka ma:** apps/web/components/finance/penzugy-help.tsx:633 — a 207.02 kód leírása: „Elszámolásra előlegként kifizetett összeget ide könyvelünk. Az előlegként kiadható összeg: 5000 lej/személy/nap."; és :1106 — „Az előlegként kiadható összeg 5000 lej/személy/nap." Ugyanennek a fájlnak az 1060-1063. sora viszont HELYESEN 1 000 lejt ír. A decont rögzítése (apps/web/app/(dashboard)/penzugy/decont-actions.ts:277-410) semmilyen felső korlátot nem érvényesít.

**Következmény:** A lelkész a saját programjában olvasott (ötszörös) számra hivatkozva ad ki előleget — közvetlen jogszabálysértés, amit a pénzügyi vizsgálat kifogásol. Egy programon belül két, egymásnak ellentmondó szám a legrosszabb fajta hiba: mindkettőt a Kartotéka mondja.

#### 🔴 SÚLYOS — A készpénzfizetési értékhatárok (5 000 / 10 000 lej) sehol nincsenek ellenőrizve rögzítéskor

**Hivatalos:** Valtozasok_2026.txt 50-61: napi max 5 000 lej elfogadható EGY másik jogi személytől; egy nap összesen max 10 000 lej készpénzes kifizetés cégeknek, egyetlen cégnek sem több 5 000-nél; 5 000 lej feletti számla csak 5 000-ig készpénzzel, a felette lévő rész kötelezően átutalással; „Nem oszthatjuk fel a kifizetést kisebb részekre, hogy így kikerüljük a törvényi előírásokat"; magánszemélytől/magánszemélynek napi max 10 000 lej (kivéve az alkalmazott havi fizetése).

**Kartotéka ma:** Ezek a korlátok kizárólag súgószövegként léteznek (apps/web/components/finance/penzugy-help.tsx:1071-1098). A kiadás-rögzítés validációjában (packages/validations/src/finance/*, apps/web/app/(dashboard)/penzugy/actions.ts kiadás-ág) nincs sem egytételes, sem napi aggregált készpénz-korlát ellenőrzés; a `kiadas` táblában van `kedvezmenyezett_cui` (cégazonosító), tehát az adat a partneri aggregáláshoz megvan, de nincs használva.

**Következmény:** A rendszer engedi rögzíteni azt, amit a törvény tilt (pl. 8 000 lejes készpénzes számla-kifizetés, vagy ugyanannak a cégnek több részletben 5 000 fölött ugyanazon a napon). A hivatalos Excel ezt szintén nem tiltja, de ott a lelkész nem hiszi, hogy „a program vigyáz rá" — a Kartotékánál ez a téves biztonságérzet valós kockázat.

#### 🔴 SÚLYOS — Anyagraktár: hiányzik a „Kitől vettük be" / „Kinek adtuk ki" mező, ezért a Bevételezési bizonylat és a raktári Kiadási kísérőív nem állítható elő

**Hivatalos:** Anyagraktarkonyv.txt, 'Bevetel' lap D5-L5 fejléc: 'Iratszám | Dátum | Kitől vettük be | Anyag megnevezése | Megjegyzés | Mennyiség | M.egység | Egységár | Érték'; 'Kiadas' lap D3-L3: '… | Kinek adtuk ki | …'. Sugo.txt 486-490: „Bevételezési bizonylat (2 példány - az egyik kerül a bevételt igazoló irat mellé …, a másik egy külön iratgyűjtőbe); Kiadási kísérőív (2 példány - az egyiket kapja az átvevő …); Anyagraktárkönyv, Leltárív, Vagyonleltárjelentés". Penzugyi_vizsgalat.txt is kéri: „raktárbavételi jegyzék (Nota de intrare-receptie)", „fogyasztási jegyzék (bon consum)".

**Kartotéka ma:** migration-docs/Database_schema.sql:1814-1841 (`material_movements`): datum, tipus, mennyiseg, ertek, irat_szama, magyarazat — NINCS partner-oszlop (sem kitol, sem kinek/atvevo). Nyomtatásból csak az Anyagraktárkönyv létezik: apps/web/lib/finance/anyagraktar-print.ts:134 (`buildAnyagraktarkonyvHtml`). Az apps/web/lib/inventory/reporting.ts:9-51 öt nyomtatványtípusa (leltariv, registru_inventar, aktiv_passziv, torolt_targyak, vagyonleltari_jelentes) között nincs bevételezési bizonylat és nincs raktári kiadási kísérőív.

**Következmény:** A pénzügyi vizsgálaton kifejezetten kért két bizonylatot (Nota de intrare-recepție, bon consum) a Kartotékából nem lehet kinyomtatni, és utólag sem pótolható, mert az adat (kitől / kinek) rögzítéskor sem kerül be. A segélyszállítmányok elszámolása (Penzugyi_vizsgalat.txt) emiatt teljesen a rendszeren kívül marad.

#### 🔴 SÚLYOS — Az új lelkészi jelentés (Igazgatótanács 65/2025, 2026-tól KÖTELEZŐ) mezőkatalógusa a hivatalos űrlap töredéke

**Hivatalos:** Valtozasok_2026.txt 15-18: „Az Igazgatótanács a 2025. október 8-án tartott ülésén 65/2025. szám alatt elfogadta az új lelkészi jelentést… Az új lelkészi jelentés 2026-tól kötelező." A hivatalos űrlap IV. (Belmissziós tevékenységek), VI. (Szeretetszolgálat) és VIII. (Ingatlanok) fejezetei újak; a IV. fejezet önmagában ~30 alkérdés (gyerek/ifjúsági/nőszövetségi/presbiterszövetségi bontásban, IGEN-NEM és 200 karakteres mezőkkel), a VI. fejezet 5 pont, mindegyiknél a ráköltött ÖSSZEGGEL.

**Kartotéka ma:** apps/web/lib/lelkeszi-jelentes/types.ts — IV. fejezet: 4 mező (175-178: Nőszövetség / IKE / Énekkar / Egyéb), VI. fejezet: 2 mező (199-200), VIII. fejezet: 2 mező (221-222). A saját, ma készült specifikáció (docs/EREK-MUNKANAPLO-LELKESZI-JELENTES-SPEC-2026-08-14.md) részletesen leírja a hiányzó szerkezetet, a 18. feladat pedig „pending" állapotban van.

**Következmény:** A 2026-ra kötelezővé tett jelentés a Kartotékából nem adható le — a lelkésznek párhuzamosan ki kell töltenie a hivatalos xlsx-et, és a Kartoteka munkanapló-adatai nem áramlanak át.

#### 🟠 KÖZEPES — A havi/éves nyomtatási rend eltér a 2026-os hivatalos rendtől: a checklist havi banknaplót kér, a kötelező havi Főkönyv és az évi Csoportnapló pedig hiányzik belőle

**Hivatalos:** Valtozasok_2026.txt 20-30: „Hónap végén ki kell nyomtatni egy példányban a havi kasszakönyvet… A banki iratgyűjtőbe a havi banki kivonatot (extras) kell kinyomtatni a záráshoz. A napi extras-t nem kell kinyomtatni. A banknaplót a kimutatások munkafüzetből csak év végén kell nyomtatni, éves változatban, a lenyílóból a Jan_Dec opciót választva. Szintén csak az év lezárása után kell kinyomtatni a csoportnaplót. Kötelező kinyomtatni a Főkönyvet (Registru Jurnal)…" Sugo.txt 373-377: „A főkönyvet hónap végén nyomtatjuk ki… Öt évenként vagy 200 lap terjedelmet követően kemény táblába bekötjük… nem selejtezhető."

**Kartotéka ma:** packages/ui-app/src/finance/FinanceSugoChecklist.tsx — havi teendők (havi-1…havi-5): bank-import, belső mozgás, „Kasszakönyv (Registru Casa) kinyomtatva", „Banki könyv (Registru Banca) kinyomtatva" (havi!), anyagraktár. A kötelező HAVI Főkönyv (Registru Jurnal) nyomtatása egyik listában sincs; a Csoportnapló nyomtatása az év végi listából (eve-1…eve-9) is hiányzik. Maga a nyomtatási központ egyébként tudja mindkettőt, éves módban is (packages/ui-app/src/finance/reporting.ts:44-101, FinancePrintDialogBody.tsx:669 „teljes év").

**Következmény:** A lelkész a Kartotéka saját checklistjét követve fölöslegesen nyomtat havi banknaplót, ugyanakkor kimarad a kötelező, nem selejtezhető Főkönyv havi nyomtatása és az évi csoportnapló — pontosan az a két irat, amit a pénzügyi vizsgálat tételesen kér (Penzugyi_vizsgalat.txt: „Naplóregiszter (Registru jurnal) kinyomtatva és lefűzve", „Csoportnaplók kinyomtatva").

#### 🟠 KÖZEPES — A kiadási kísérőív kötelezettségét semmi nem követi: a `kiadasikiseroiv` tábla halott kód

**Hivatalos:** Sugo.txt 369: „Minden kiadás mellé kötelezően ki kell nyomatni kiadási kísérőívet. Mellékelni kell a kiadási iratot, és külön-külön iratgyűjtőkbe lefűzni a kassza és a bankszámlák iratait." Valtozasok_2026.txt 22-23: „Ki kell nyomtatni a kiadási kísérőívet a készpénzes és a banki kifizetések mellé is."

**Kartotéka ma:** A `kiadasikiseroiv` tábla létezik (migration-docs/Database_schema.sql:338-349: id_kiadas, iratszam, datum), de a teljes alkalmazásban egyetlen írás/olvasás sincs rá — csak két komment említi (packages/core/src/finance/kiadas/storno.ts:9, packages/validations/src/finance/kiadas-delete.ts:11). A nyomtatás (kiseroiv-print-dialog.tsx, `kiadasi_kiseroiv` típus) ad-hoc, napi ívet állít elő, de nem jegyzi fel, hogy elkészült-e.

**Következmény:** Nem lehet megmondani, melyik kiadásos naphoz készült kísérőív — sem a lelkésznek, sem a számvevőnek. Év végén, a mappa rendezésekor derül ki a hiány, amikor már nehéz pótolni. A hivatalos Excelben ugyanez igaz, de ott a nyomtatás fizikailag a munkamenet része volt.

#### 🟠 KÖZEPES — Sorrend-eltérés: a Decont és a Dispoziție a hivatalos csomagban NEM könyvel, a Kartotékában viszont automatikusan tételt hoz létre

**Hivatalos:** Sugo.txt 501-502: „A kifizetési utalvány nincs hozzácsatolva a könyveléshez, az ide beírt adatokat a könyvelés nem veszi át, hanem csupán a DP elkészítésében segít." Ugyanez igaz az Elszamolas_2026.xlsx-re (önálló munkafüzet, saját 'Adatok' lappal, C5-M5 fejléc: Szám, Név, Dátum, Elszámolás jellege, Kapott előleg, Irat sz., Irat, Irat dátum, Irat kiállítója, Magyarázat, Összeg). A Sugo.txt 508-518 szerint a decont-tételeket a pénztárkönyvbe KÜLÖN kell bevezetni.

**Kartotéka ma:** apps/web/app/(dashboard)/penzugy/decont-actions.ts:277-410 — a decont mentése maga generálja a kiadás-sorokat és az előleg visszavezetését; a `dispozitie` tábla `kiadas_id` / `befizetes_id` oszlopokkal a könyvelt sorra mutat (migration-docs/sql/2026-06-06-decont-dispozitie-sorszam.sql:97-119). A mezőkészlet egyébként pontosan fedi a hivatalosat (nev, tisztseg, osszeg, cel, ci_tipus, ci_serie, ci_nr).

**Következmény:** Ez önmagában JOBB a hivatalosnál, de aki az Excel-megszokás szerint dolgozik (előbb decont, aztán „bevezetem a kasszába is"), az DUPLÁN könyvel. A rendszer ezt nem akadályozza meg és nem is figyelmezteti — a Súgóban expliciten ki kellene mondani, hogy a decont/dispoziție UTÁN tilos kézzel is rögzíteni.

#### 🟠 KÖZEPES — A `keszpenz_nyito_egyenleg` tábla a séma-dumpban nem szerepel — a migrációs fájl önmagában nem bizonyíték, hogy élesben létezik

**Hivatalos:** Sugo.txt 235-236: „Év elején az H6-os … cellába kell beírni az előző évi készpénzegyenleget"; Utmutato_az_EREK_szamadasahoz.txt 1-3. sor: „A számadás leadása előtt mindig ellenőrízzük le, hogy a kezdő egyenlegünk talál-e az előző év leadott számadásának záró egyenlegével. A számadások összesítésénél a felsőbb egyházi hatóság ezt mindig leellenőrzi és ha nem talál, visszaküldi a számadást."

**Kartotéka ma:** A táblát a migration-docs/sql/2026-06-20-keszpenz-nyito-egyenleg.sql:30-45 hozza létre (congregation_id, eve, nyito_egyenleg, forrasa), és a felület erre épít (apps/web/app/(dashboard)/penzugy/nyito-egyenleg-settings-actions.ts, opening-balances-dialog.tsx). A migration-docs/Database_schema.sql dumpban viszont NEM szerepel — a bankszámla-megfelelője (bankszamla_nyito_egyenleg, 1843-1862) igen.

**Következmény:** Ha a migráció élesben nem futott le, a készpénz-nyitó némán 0 marad, és az egész évi kassza-egyenleg, a számadás nyitó 2. sora és a következő évi átvitel is torzul — pontosan az a hiba, amit a felsőbb hatóság visszaküld. Ellenőrizni kell (lásd SQL).

#### 🟡 KISEBB — Az „A" (nagy) / „B" (kis) gyülekezet-változat fogalma nem létezik a Kartotékában — és a nyomtatványról hiányzik a verzió-/változatjelölés

**Hivatalos:** Valtozasok_2026.txt 6-9: „Ettől az évtől csak két változatban készül a könyvelés segédlet: „A" nagy gyülekezetek részére és „B" a kis gyülekezetek részére. Megszűnik a könyvelés „C" és „D" változata… Az „A" és „B" változat TARTALMAZ MINDENT, ami korábban csak a „C" és „D" tartalmazott." A rendelkezésre bocsátott csomag az „A" változat: Adatok_2026.txt 'Hibak' lap A2='7.4a', és 20 bankszámla-munkalap (A…T), Kassza 10 017 sorig. A verziószám a nyomtatványra kerül: Koltsegvetes B77=`="Verziószám: "&Hibak!A2`, G98=`="v "&Hibak!A2`. Sugo.txt 396-398: „a számok utáni a, b, k, u, betű azt jelzi, hogy kinek készült az illető változat… Ez a verzió szám a Költségvetés lap felső felében látható, kék színben."

**Kartotéka ma:** A teljes repóban nincs gyülekezet-méret szerinti könyvelési megkülönböztetés: a „kis/nagy gyülekezet" kifejezés csak árazási sávként (migration-docs/sql/2026-04-18-admin-system-finance.sql:255-258) és teljesítmény-kommentekben fordul elő. A `bankszamlak` tábla korlátlan számlát enged (migration-docs/Database_schema.sql:938-956), a tételek száma nincs limitálva, a `szamadasicel` egyetlen közös katalógus `szint` (gyulekezet/egyhazmegye/kerulet) bontással (uo. 547-562). A nyomtatványokon (packages/ui-app/src/finance/budget-reporting.ts, `buildCover`) semmilyen verzió- vagy változatjelölés nincs.

**Következmény:** ÉRDEMBEN NEM HIÁNY: a 2026-os A/B különbség kapacitás (bankszámla-lapok száma és sorszám), nem eltérő tételrend vagy eltérő könyvelési logika — ezt a Kartotéka korlátlan modellje mindkét méretre lefedi, tehát méret szerinti külön ág építése FÖLÖSLEGES volna. Ami valóban hiányzik: a hivatalos íven szereplő verzió/változat-jelölés (pl. „v 7.4a"), amit a számvevő a beadott költségvetésen és számadáson keres — a Kartotéka nyomtatványán semmilyen forrás-megjelölés nincs.

### Ami teljesen hiányzik

- Tartozások (Datorii) és Kintlevőségek (Creanţe) nyilvántartása és a Számadás megfelelő blokkja — nincs se tábla, se felület, se nyomtatványrész (hivatalos: Szamadas B216–B233, végső Sold B234)
- A számadási záró Casa / Banca bontása a nyomtatványon (ma `—` jel áll a helyén) — enélkül a hivatalos 1. sz. hibajelzés nem is végezhető el
- Blokkoló egyeztetés a véglegesítés előtt: számadási záró = kassza + bank egyenleg (Hibak!B1 megfelelője)
- Élő kasszaplafon-figyelmeztetés a Kassza/Monetár felületen (Kassza!I2 megfelelője, 50 000 lej + 3 nap)
- Készpénzfizetési korlátok érvényesítése rögzítéskor: 1 000 lej/nap/személy decont-előleg, 5 000 lej egy jogi személytől/egy jogi személynek naponta, napi 10 000 lej össz-készpénz cégeknek, 5 000 lej feletti számla kötelező banki része, a feldarabolás felismerése
- Anyagraktár partner-mező („Kitől vettük be" / „Kinek adtuk ki") és a rá épülő két bizonylat: Bevételezési bizonylat (Nota de intrare-recepție) és raktári Kiadási kísérőív (bon consum), 2-2 példányban
- Az IT 65/2025 szerinti lelkészi jelentés IV. (Belmissziós), VI. (Szeretetszolgálat, összegekkel) és VIII. (Ingatlanok) fejezeteinek teljes mezőkészlete
- A kiadási kísérőívek elkészültének nyilvántartása (a `kiadasikiseroiv` tábla ma halott) és „hiányzó kísérőív" jelzés
- A hivatalos nyomtatványokon a forrás/verzió jelölése (a hivatalos íven: „v 7.4a", Koltsegvetes G98)
- Az egyházmegye és az egyházkerület neve a Költségvetés/Számadás borítóján (az adat megvan, csak nincs behúzva)
- Figyelmeztetés arra, hogy a Decont/Dispoziție UTÁN a tételeket tilos kézzel is rögzíteni (duplán könyvelés elleni védelem)
- A Főkönyv (Registru Jurnal) havi nyomtatása és a Csoportnapló év végi nyomtatása az élő zárási checklistből
- Szórvány / leányegyházközség, illetve külön könyvelést vezető Nőszövetség és Presbiterszövetség „Számadások összesítője" (Penzugyi_vizsgalat.txt kéri, ha van ilyen)

> **Megjegyzés:** Forrás-korlát: a rendelkezésre bocsátott csomag az „A" (nagy gyülekezet) változat (Adatok_2026.txt, Hibak!A2='7.4a', 20 bankszámla-lap A–T). A „B" változat fájlja nem állt rendelkezésre, ezért az A/B tartalmi azonosságát a Valtozasok_2026.txt kijelentésére alapoztam („Az »A« és »B« változat tartalmaz mindent, ami korábban csak a »C« és »D« tartalmazott"), és arra, hogy az Utmutato_az_EREK_szamadasahoz.pdf EGYETLEN, közös útmutató mindkettőhöz. Ha később előkerül a „B" fájl, egyetlen dolgot érdemes ellenőrizni benne: a 'Szamadas' lap sorkészlete (B101–B234) azonos-e — ha igen, a gyülekezet-méret szerinti külön ág építése végleg kizárható.

Amit ELLENŐRIZTEM és RENDBEN VAN (nem került az eltérések közé): a belső mozgás kettős könyvelése és önjavító párosítás-figyelője (apps/web/lib/finance/internal-movement-health.ts, actions.ts:3688-3800) a hivatalosnál erősebb — a Sugo.txt 255-256 szerint az Excel „a számítógép automatikusan ezeket nem írja be", a Kartotéka viszont mindkét oldalt megcsinálja, és a banki import duplikáció-védelemmel párosít (packages/core/src/finance/bank-import/import-transactions.ts:212-292, 498-505); a valuta év végi átértékelése a helyes kódokra könyvel (103.04 nyereség / 203.03 veszteség — packages/ui-app/src/finance/types.ts:150, actions.ts:4197), pontosan úgy, ahogy a Sugo.txt 314-329 előírja; a csoportnapló kigyűjti a jogcím nélküli tételeket egy „Fără capitol — Besorolatlan" csoportba (reporting.ts:852-878) — ez a hivatalos „zöld cella" jelzés jó megfelelője; az év-zár fail-closed őre (packages/core/src/finance/year-lock.ts) a beküldött számadás utólagos elmozdulását akadályozza; az Iktató ügykörjegyzéke és megőrzési típusai (iktato.ugykor_kod, retention_type 'F.Á.'/'É.Á.') pontosan követik a 2024-től érvényes ügykörjegyzéket (Iktato.txt 'Ugykorjegyzek_2024tol' lap); a Dispoziție mezőkészlete hiánytalanul fedi a hivatalosat (nev, tisztseg, osszeg, cel, ci_tipus/serie/nr — vö. Dispozitie_de_plata_2026.txt 'Adatok' B3–K3).

Sorrendi javaslat a javításhoz (nem kértél tervet, de a súlyosság ezt adja ki): 1) Számadás záró blokk (Casa/Banca + Datorii/Creanţe) és a rá épülő blokkoló egyeztetés, mert ez az aláírt, beküldött irat; 2) a Súgó hibás 5000 lejes előleg-száma — egy szövegjavítás, azonnali jogi kockázatot szüntet meg; 3) kasszaplafon-jelzés; 4) egyházmegye/egyházkerület a nyomtatvány fejlécébe (az adat megvan).

---

## 5. Anyagraktár — hivatalos Anyagraktarkonyv.xlsx (EREK 2026) ⇄ Kartotéka `materials` / `material_movements` modul (+ leltár-határ: mijloc fix / obiect de inventar / material)

A hivatalos Anyagraktarkonyv.xlsx 8 lapból áll: 'Keszlet' (készletlap-törzs, max. 196 anyag; D=S.sz, E=Anyag megnevezése, F=Megjegyzés, G=Egységár, H=Mérték-egység, I=Készleten levő mennyiség, J=Érték), 'Bevetel' és 'Kiadas' (mozgások), majd négy nyomtatvány: 'Kisero_iv' (Bevételezési bizonylat / Anyagraktári kiadási utalvány), 'Anyagraktar_iv' (maga az ANYAGRAKTÁRKÖNYV lap: S.sz | Kelte | Irat száma | Magyarázat | Mennyiség bev/kia/egyenleg | Érték bev/kia/egyenleg, 30 sor/lap, Áthozat/Átvitel sorral, B43='Készítette:' I43='Ellenőrízte:'), 'Leltar_iv' (LISTA DE INVENTARIERE / LELTÁRÍV - ANYAGRAKTÁR, kétnyelvű, 50 sor/lap, tetszőleges leltározási dátumra) és 'Vagyonleltar_jelentes' (a leltár munkafüzet Pénztár_beruházás lapjára átírandó „Anyag raktári készletek” sor: előző évi egyenleg + bevétel − kiadás = egyenleg, kereszt-ellenőrzéssel a leltárív összegére). Az értékelési mód se nem FIFO, se nem átlagár: a Sugo.txt 15. oldala kimondja, hogy „Ha egy bizonyos anyagból különböző áron vásároltunk, akkor a változó ár szerint be kell írni újból az anyag megnevezését, mivel a különböző árú készleteket külön tartja nyilván” — vagyis FIX ÁRAS KÉSZLETLAP (identificare specifică árlaponként), és az Anyagraktar_iv mindkét oldalt (bevétel és kiadás értékét) a lap EGYETLEN egységárával számolja (I11='=F11*$O$4', J11='=G11*$O$4'). A Kartotéka WEBEN megvan a modul (2026-04-18-anyagraktar.sql: `materials` + `material_movements`, RLS-szel; `anyagraktar-actions.ts` szerver-akciók; Leltár oldal „Anyagraktár” füle; anyagraktárkönyv-nyomtatás), az adatlánc UI → server action → tábla → RLS zárt és fail-closed (mindenhol `effectiveCongregationId` ellenőrzés). A DESKTOPON a modul teljesen hiányzik: egyetlen desktop-fájl sem hivatkozik a materials/material_movements táblákra, és nincs Anyagraktár oldal. A hivatalos ívnek a rendszer részben felel meg: az anyagraktárkönyv-lap oszlopképe és aláírás-blokkja stimmel, de a négyből három nyomtatvány (Bevételezési bizonylat, Kiadási utalvány, anyagraktári Leltárív) hiányzik, a Vagyonleltári jelentés nyomtatványból hiányzik a kötelező „Anyag raktári készletek” sor, és nincs dátumra vetített (12.31-i) készletlekérdezés — a felület mindig a MAI állapotot mutatja. A leltár↔anyagraktár határ a kódban csak kétágú (205.01 → alapeszköz ≥2500 lej, 201.12 → csekély értékű <2500 lej); a harmadik ág (201.08 Irodaszerek/nyomtatványok és 201.09 Fogyóanyagok → anyagraktár) sehol nincs bekötve, holott a 14_Egyhazi-adminisztracio 6/7. pontja szerint „Minden olyan anyagot, amit nem használnak fel azonnal, nyilvántartásba kell venni, be kell vezetni a raktárkönyvbe”.

### Eltérések

#### ⛔ BLOKKOLÓ — A Vagyonleltári jelentés nyomtatványból hiányzik a kötelező „Anyag raktári készletek” sor

**Hivatalos:** Anyagraktarkonyv.xlsx / 'Vagyonleltar_jelentes' lap: B2='A vagyonleltári jelentésbe (leltár munkafüzet, Pénztár_beruházás munkalap) a következő adatokat kell átírni:'; C5..G5 fejléc = 'Tárgycsoport | Előző évi egyenleg a. | Bejövetel/Bevétel b. | Kiadás/Törlés c. | Egyenleg a+b-c'; C7='Anyag raktári  készletek', D7='=P5', E7='=R3', F7='=R4', G7='=SUM(D7:E7,-F7)'. A C14 cella ráadásul kereszt-ellenőriz: '=ROUND(G7,2)-ROUND(Leltar_iv!O3,2)', és eltérés esetén a C15-C18 kiírja: 'Az egyenleg nem egyenlő a leltárív egyenlegével… valamelyik raktárkészlet minuszban van… Figyelmeztetés!!!'

**Kartotéka ma:** apps/web/lib/inventory/reporting.ts:644-757 (buildVagyonReport): a sorok a leltári kategóriákból (getCategorySummary) épülnek, plusz két kézzel hozzáadott sor — extraRows (:654) = 'Pénztár' és 'Követelések'. Anyagraktár-sor nincs. Az anyagraktár értéke KIZÁRÓLAG képernyőn, a Leltár fül sárga bannerében jelenik meg (apps/web/components/inventory/inventory-main-v3.tsx:566-596), nyomtatványba nem kerül.

**Következmény:** A lelkész által kinyomtatott és leadott hivatalos Vagyonleltári jelentésből hiányzik egy kötelező tárgycsoport. A számvevő / egyházkerületi könyvvizsgáló azonnal eltérést talál, és a jelentés nem egyeztethető a leltáríven szereplő anyagraktári összeggel.

#### ⛔ BLOKKOLÓ — Nincs dátumra vetített (as-of) készlet: az anyagraktár értéke MINDIG a mai állapot, nem a 12.31-i

**Hivatalos:** 'Leltar_iv' lap: I2 = szabadon megadható leltározási dátum, Y1='=IF(I2=0,W1,IF(I2<X1,W1,I2))'. Erre épül a Keszlet lap R/S/T/U oszlopa: S5='=SUMIF(Kiadas!$G$6:$G$1000,C5,Kiadas!$BA$6:$BA$1000)', ahol Kiadas!BA6='=IF(W6<=Leltar_iv!$Y$1,I6,0)' — vagyis a bevétel és a kiadás mennyisége is a leltározási DÁTUMIG szűrve; R5='=S5-T5' (egyenleg azon a napon), U5='=PRODUCT(G5*R5)' (érték azon a napon); Leltar_iv!O3='=SUMIF(Keszlet!R5:R200,">0",Keszlet!U5:U200)'. A Vagyonleltar_jelentes P3/Q3/P4/Q4 szintén dátumhatáros SUMIF-ekkel adja az előző évi egyenleget és az évi bevételt/kiadást.

**Kartotéka ma:** apps/web/app/(dashboard)/leltar/anyagraktar-actions.ts:96-124 (listMaterials aggregálás) és :438-459 (getAnyagraktarStats) — egyik lekérdezésben SINCS `datum` szűrő, minden nem stornózott mozgást összead. A `getAnyagraktarStats()` paramétert sem fogad (:430), így a Leltár oldal év-választója nem hat rá.

**Következmény:** A januárban rögzített idei mozgás beleszámít a tavalyi december 31-i állapotba. A vagyonleltári jelentés készítésekor a lelkész rossz számot ír át — és a hiba némán marad, mert nincs mihez hasonlítani.

#### 🔴 SÚLYOS — Az egységár mutálható törzsmező — a hivatalos modell árlaponként külön készletlapot ír elő

**Hivatalos:** Sugo.txt (15. oldal, „Anyagraktárkönyv” fejezet, 1. pont): „A készlet munkalapra be kell vezetni az anyag megnevezését, árát, mértékegységét. Ha egy bizonyos anyagból különböző áron vásároltunk, akkor a változó ár szerint be kell írni újból az anyag megnevezését, mivel a különböző árú készleteket külön tartja nyilván.” A Keszlet!C5 kulcs maga tartalmazza az árat: '=IF(E5<>0,TRIM(D5&" - "&E5&IF(F5<>0," - "&F5,"")&" - "&L5&","&M5&" lej/"&H5),$C$3)'. Az Anyagraktar_iv MINDKÉT oldalt a lap egyetlen áráról számolja: I11='=IF(F11<>"",F11*$O$4,"")' (bevétel értéke), J11='=IF(G11<>"",G11*$O$4,"")' (kiadás értéke). A 'Szinek' lap B7 külön hibajelzést ír le arra az esetre, ha a törzs nevét/megjegyzését/egységárát utólag módosítják.

**Kartotéka ma:** materials.egysegar egyetlen numeric mező (migration-docs/sql/2026-04-18-anyagraktar.sql:36), amit az updateMaterial szabadon felülír (anyagraktar-actions.ts:267-285). A mozgás értéke mozgásonként tárolódik és kézzel felülbírálható (apps/web/components/modals/material-movement-dialog.tsx:195-211), kiadásnál a default az AKTUÁLIS egységár × mennyiség (anyagraktar-actions.ts:335-345). Semmi nem kényszeríti új anyagsor nyitására árváltozáskor, és a materials táblán nincs egyediségi index sem.

**Következmény:** Árváltozás után a kiadás más áron vezeti ki a készletet, mint amin bejött: a `keszlet_ertek` mennyiség>0 mellett is negatívba fordulhat, vagy nullás mennyiség mellett maradhat pénzérték. A nyomtatott anyagraktárkönyv fejlécében ugyanakkor EGYETLEN (az aktuális) egységár szerepel — ami a régi sorokra hamis. Sem FIFO, sem átlagár nincs, de nem is szabad: a hivatalos mód a fix áras készletlap, amit a rendszer nem kényszerít ki.

#### 🔴 SÚLYOS — Hiányzik a Bevételezési bizonylat és az Anyagraktári kiadási utalvány (kísérőív)

**Hivatalos:** 'Kisero_iv' lap: C1='A jobboldali, zöld cellában lehet váltani a Bevételezési bizonylat és az Anyagraktári kiadási utalvány között.'; K2='Bevételezési bizonylat', K3='Anyagraktári kiadási utalvány', L2='Átadó:', L3='Átvevő:', G5='="Szám: "&N1&" / "&N2', 10 tételsor + C22='Kelt:', D23='Átadta', F23='Átvette' (két példány egy lapon: a 28-47. sor a másolat). Sugo.txt 15. o. 4. pont: „Bevételezési bizonylat (2 példány…) / Kiadási kísérőív (2 példány — az egyiket kapja az átvevő, a másik egy külön iratgyűjtőbe)”. 14_Egyhazi-adminisztracio 6/7.: „Minden anyagot külön oldalra vezetünk be, ún. bevételi utalvány segítségével… folyamatosan vezetjük ki, ún. kiadási utalvány segítségével. A bevételi és kiadási utalványokat is ebbe a dossziéba helyezzük.”

**Kartotéka ma:** Az egyetlen anyagraktári nyomtatvány az apps/web/lib/finance/anyagraktar-print.ts — maga a könyvlap. Bizonylat/utalvány nyomtatvány sehol. FIGYELEM a névütközésre: a meglévő apps/web/components/finance/kiseroiv-print-dialog.tsx a PÉNZÜGYI kiadási kísérőív (kassza/bank aznapi kiadásai), teljesen más dokumentum — nem pótolja az anyagraktári kiadási utalványt.

**Következmény:** A 6/7. „Anyagraktári ügyek” iratgyűjtőbe nincs mit lefűzni, és az átvevő nem kap aláírt utalványt. Pénzügyi vizsgálatnál ez hiányzó, pótolhatatlan irat (a bizonylat sorszáma és a Kelt/Átadta/Átvette aláírás utólag nem gyártható).

#### 🔴 SÚLYOS — Hiányzik a LELTÁRÍV – ANYAGRAKTÁR (Lista de inventariere) nyomtatvány

**Hivatalos:** 'Leltar_iv' lap: B4='LISTA DE INVENTARIERE', B5='LELTÁRÍV - ANYAGRAKTÁR'; kétnyelvű fejléc B6..I6 = 'Nr crt./S.sz. | Denumirea bunurilor inventariate/Felleltározott tárgyak elnevezése | Cod/Leltári sz. | U.M./M.E. | Cant/Meny | Pret u. contabil/Könyvelési e.ár | Val. contabilă/Könyvelési ért. | Observatie/Megjegyzés'; 50 sor/lap (O2='=ROUNDUP(O1/50,0)'), lapfej I3='="pg. "&N1&" / "&Y2&"."&Z2&"."&AA2', összesítő O4='Total / Összesen: ' és O3. Penzugyi_vizsgalat.txt 45. sor: bemutatandó „Az évenkénti leltározások alkalmával készített leltárív (Lista de inventariere)”.

**Kartotéka ma:** apps/web/lib/inventory/reporting.ts:355-425 — a 'leltariv' nyomtatvány kizárólag a leltar_tetelek táblából épül (applyInventoryFilters(items…)); az INVENTORY_PRINT_TYPES lista (:16-51) öt eleme közül egyik sem anyagraktári. Az Anyagraktár fülön csak a könyvlap nyomtatható (material-warehouse-tab.tsx:148-183).

**Következmény:** A leltározási jegyzőkönyvhöz nem csatolható anyagraktári leltárív; az anyagraktár év végi felleltározása papíron nem dokumentálható a hivatalos formában.

#### 🔴 SÚLYOS — A készlet-őr dátumfüggetlen, a stornó pedig egyáltalán nem ellenőriz — némán mínuszba fordul a készlet

**Hivatalos:** 'Kiadas' lap adatérvényesítése: type=custom f1='$M1006>=0' sqref=I1006:I2000 — vagyis SORONKÉNTI futó egyenleg-őr a kiadási mennyiségen. 'Szinek' lap: B5='Kiadás lap, világoskék sor: a készlet nulla.', B6='Kiadás lap, piros betűk: a készlet mínusz.' A 'Vagyonleltar_jelentes' C15-C18 pedig kiírja: „Az egyenleg nem egyenlő a leltárív egyenlegével. A különbség … lej. Ennek oka, hogy valamelyik raktárkészlet minuszban van. (Több volt a kiadás mint a bevétel). Ellenőrízd a Készlet munkalapot! / Figyelmeztetés!!!”

**Kartotéka ma:** anyagraktar-actions.ts:347-364 — a kiadás előtti ellenőrzés a TELJES, dátum nélküli mozgáshalmazt összegzi (`keszlet`), majd `keszlet - input.mennyiseg < 0`-t vizsgál; a mozgás dátuma nem játszik szerepet. A stornoMaterialMovement (:390-417) semmilyen készlet-ellenőrzést nem végez. A negatív készlet egyetlen jelzése a listasor piros színe (material-warehouse-tab.tsx:354-356); a nyomtatott anyagraktárkönyvön és a leltár-összesítőn nincs figyelmeztetés.

**Következmény:** Egy 01.05-i bevétel után 01.03-ra visszadátumozott kiadás átmegy az ellenőrzésen, holott azon a napon nem volt készlet. Egy bevétel utólagos stornója után a készlet azonnal mínuszba fordul — a lelkész csak akkor veszi észre, ha rápillant a listára, a jelentésbe viszont már a hibás szám kerül.

#### 🟠 KÖZEPES — Nincs iratszám-generálás és nincs többsoros (napi/partnerenkénti) bizonylat-fogalom

**Hivatalos:** 'Bevetel' lap D6='=IF(AND(OR(Kiadas!C5<>Kiadas!C6,Kiadas!C6=1),SUM(Kiadas!L6:L26)<>0),YEAR(Kiadas!W6)&"/"&Kiadas!C6,"")' — automatikus „ÉV/sorszám” bizonylatszám, évente 1-től újraindulva; a T oszlop (T6='=IF(OR(E6<>0,F6<>0,SUM(L6:L26)=0),E6&F6,0)') fogja csoportba az azonos napi + azonos partnerű sorokat egy bizonylatra. Sugo.txt 15. o. 3. pont: „Ha egy nap azonos számlán vettünk be többféle anyagot, vagy egy nap azonos személynek adunk ki többféle anyagot, a dátumot és a kitől, illetve kinek oszlopot csak egyszer kell kitölteni. Ha minden sor mellé kitöltjük ezeket, akkor a Kiadási kísérőívre, illetve a Bevételezési bizonylatra csak egy sor kerül.”

**Kartotéka ma:** material_movements.irat_szama szabad szöveges mező (2026-04-18-anyagraktar.sql:64); a UI-ban placeholderrel kért kézi beírás (material-movement-dialog.tsx:213-222). Nincs generálás, nincs egyediség-ellenőrzés, nincs bizonylat-entitás, egy mozgás = egy sor = egy bizonylat.

**Következmény:** A bizonylatszámozás folytonossága nem ellenőrizhető (a vizsgálat ezt kéri), és egy vásárlás több anyaga nem fűzhető egyetlen bevételezési bizonylatra — vagyis még ha megépülne a bizonylat-nyomtatvány, is soronként külön lapot adna.

#### 🟠 KÖZEPES — A nyugtatömbök és a számlatömbök nem kapnak anyagraktárkönyv-lapot

**Hivatalos:** Penzugyi_vizsgalat.txt (bemutatandó iratok listája, 24. és 26. sor): „Nyugtatömbök anyagraktárkönyve”, illetve „Számlatömbök anyagraktárkönyve”. 14_Egyhazi-adminisztracio 6/7.: „Ide tartoznak a nyugtatömbök, építkezési anyagok, nyomtatványok stb.”

**Kartotéka ma:** A chitanta_tombok külön modell (seria, szam_kezdet/szam_veg, darabszam_ossz, felhasznalt_darabszam — migration-docs/Database_schema.sql), egyetlen material_movements sor sem tartozik hozzá. Az Anyagraktár fül csak MEGJELENÍTI a tömböket (material-warehouse-tab.tsx:32-36, 90-93), de a buildAnyagraktarkonyvHtml kizárólag a filteredMaterials-ból épít (:150-166). Számlatömb (factura) nyilvántartás egyáltalán nincs a rendszerben.

**Következmény:** A vizsgálaton kötelezően bemutatandó két anyagraktárkönyv nem nyomtatható ki a Kartotékából; a lelkésznek kézzel vagy külön Excelben kell vezetnie — pont azt, amiért a modul készült.

#### 🟠 KÖZEPES — A nyomtatott anyagraktárkönyv nincs lapokra bontva, hiányzik az Áthozat / Átvitel sor

**Hivatalos:** 'Anyagraktar_iv' lap: 30 tételsor laponként (B11..B40, O11='=P5+1', P4='=ROUNDUP(P3/30,0)', P5='=ROUND(SUM(N3,-1)*30,0)'); E10='=IF(N3>1,V4,"")' ahol V4='Áthozat az előző lapról:' és H10='=IF(N3>1,T4,"")' hozza a mennyiség-, K10 az érték-áthozatot; a lap alján E41 = V5='Átvitel a következő lapra: ' + H41/K41. B2 szöveg: „Ebben az anyagraktárkönyvben X lap van. Ebből jelenleg a(z) Y. lap látszik.” 14_Egyhazi-adminisztracio 6/7.: „Az anyagraktárkönyv lapokat évente kinyomtatjuk és az irattartóban lefűzve tároljuk.”

**Kartotéka ma:** apps/web/lib/finance/anyagraktar-print.ts:54-132 — anyagonként EGYETLEN, tetszőleges hosszúságú táblát renderel (page-break-before csak anyagok között, :79). Nincs 30 soros lapozás, nincs áthozat/átvitel sor, nincs lapszámozás a lapon belül. (A Készítette/Ellenőrizte aláírás-blokk viszont megvan, :120-129 — ez egyezik az Anyagraktar_iv B43='Készítette:' / I43='Ellenőrízte:' celláival.)

**Következmény:** A kinyomtatott lap nem azonos szerkezetű a hivatalossal: sok mozgásnál a táblázat átcsúszik a következő oldalra áthozat nélkül, így az oldalak önmagukban nem olvashatók és nem hitelesíthetők.

#### 🟠 KÖZEPES — Az anyagraktár nincs bekötve a pénzügybe: a 201.08 / 201.09 jogcímű beszerzés nem ajánlja fel a raktárba vételt

**Hivatalos:** Utmutato_az_EREK_szamadasahoz.txt: 201.08 „Articole de birotică și papetărie / Irodaszerek, nyomtatványok — Formanyomtatványok, anyakönyvi és iktatólapok, papír, toner, irodai fogyó anyagok, stb.”; 201.09 „Alte materiale / Fogyóanyagok, más anyagok — Tisztítószerek, gépek üzemeltetéséhez szükséges anyagok…”. 14_Egyhazi-adminisztracio 6/7.: „Minden olyan anyagot, amit nem használnak fel azonnal, nyilvántartásba kell venni, be kell vezetni a raktárkönyvbe.” (Megjegyzés: a Sugo 15. o. kimondja, hogy maga az Excel-anyagraktárkönyv szándékosan önálló — „nincs hozzácsatolva a könyveléshez… önállóan működik” —, tehát a bekötés a Kartotékában TÖBBLET volna, de a lelkészi munkafolyamat ma szakad meg.)

**Kartotéka ma:** A séma tartalmazza a `kapcsolt_kiadas_id` és `kapcsolt_befizetes_id` FK-t (2026-04-18-anyagraktar.sql:66-67), a MovementInput típus is átveszi (anyagraktar-actions.ts:318-319, 377-378), de az egész repóban SEHOL nem íródik érték — a mezőkre csak ez az egy fájl hivatkozik. A kiadás→leltár párosító (packages/ui-app/src/finance/helpers.ts:58-64, inventoryKategoriaForExpenseKod) csak 205.01→alapeszkoz és 201.12→csekely leképezést ismer; a leltári oldalon van kiadás-választó (apps/web/app/(dashboard)/leltar/actions.ts:284-310, `penzugy_xkey`), anyagraktári nincs.

**Következmény:** A lelkész a papír/toner/tisztítószer kiadás rögzítése után semmilyen figyelmeztetést nem kap, hogy raktárba kellene vennie. Kettős, kézi adatbevitel; a kiadás és a bevételezés összege sosem egyeztethető gépileg.

#### 🟠 KÖZEPES — Az anyagraktár nincs év-zárolva: a véglegesített vagyonleltári év után is szabadon módosítható

**Hivatalos:** Penzugyi_vizsgalat.txt: „Egy elfogadott és leadott számadást utólag csak az Esperesi vagy Püspöki vizitáció ellenőrzése alkalmával lehet kiigazítani.” A Vagyonleltar_jelentes C3 utasítása: „Az előző évi egyenleget egyszer kell beírni, utána csak évenként a december 31. állapot szerint a bevételt és a kiadást. Az egyenleget ellenőrízzük le, hogy a talál-e mindkét helyen.”

**Kartotéka ma:** apps/web/app/(dashboard)/leltar/actions.ts:400-415 (finalizeLeltar) csak a `bealitas.leltar_finalized` zászlót állítja a leltárra. A createMaterialMovement és a stornoMaterialMovement (anyagraktar-actions.ts:322-417) semmilyen zárolást nem néz, és a mozgás dátuma tetszőleges múltbeli nap lehet.

**Következmény:** A leadott jelentés száma és a rendszer állapota utólag némán széthúzhat — ugyanaz a hibaosztály, amit a memóriában rögzített „a migration-fájl nem bizonyíték” tanulság ír le: a beküldött papír és az élő adat között nincs őrszem.

#### 🟠 KÖZEPES — A desktop (Tauri) alkalmazásból az Anyagraktár TELJESEN hiányzik

**Hivatalos:** 14_Egyhazi-adminisztracio 6/7.: „Az anyagraktárkönyv elektronikus formában is vezethető… az anyagraktárkönyv lapokat évente kinyomtatjuk és az irattartóban lefűzve tároljuk.” — vagyis folyamatosan, a helyszínen vezetendő nyilvántartás.

**Kartotéka ma:** apps/desktop/src/pages alatt 26 oldal van (anyakonyv, leltar-page, penzugy, chitanta-tombok stb.), anyagraktár NINCS; a teljes apps/desktop fában (src + src-tauri) egyetlen találat sincs a `materials` / `material_movements` / „Anyagraktár” kifejezésekre. A táblák a mentés-besorolásban szerepelnek (2026-08-11-biztonsagi-mentes.sql:624 és :628), de az offline szinkron-rétegben nem.

**Következmény:** Ahol nincs internet (a desktop az offline-first felület), az anyagraktár nem vezethető; a web és a desktop között tényleges funkcionális szakadék van, és a lelkész a raktári mozgásokat papírra jegyzi, majd utólag pótolja — épp a folytonos vezetés vész el.

#### 🟡 KISEBB — A materials RLS nem a központi hatókör-függvényeket használja, így a globális szűkítés kimaradt belőle

**Hivatalos:** —  (nem az EREK-csomag írja elő; a Kartotéka saját, 5. körben lefektetett biztonsági mintája: minden gyülekezeti tábla a central `current_user_can_access_congregation()` / profile_roles lábon.)

**Kartotéka ma:** migration-docs/sql/2026-04-18-anyagraktar.sql:132-137 és :216-221 — a SELECT policy harmadik lába beégetett szerepkör-teszt: `p.role = 'admin' OR p.role = 'egyhazkeruleti_admin'`, egyházmegye-/kerület-feltétel nélkül, és NEM hívja a központi függvényeket. A 2026-08-11-globalis-hozzaferes-szukites.sql a `current_user_has_global_access()` TÖRZSÉT írta át — ezt a két policy-t tehát nem érintette. Emellett esperes / egyházmegyei admin egyáltalán nem kap hozzáférést az anyagraktárhoz, szemben a leltár többi táblájával. A táblák RLS-e egyébként be van kapcsolva, az anon jog visszavonva (:286-291), és a szerver-akciók fail-closed-ok (`if (!access.effectiveCongregationId) return { error }`).

**Következmény:** Ma nem szivárgás (az egyházkerületi admin legitim módon látja az egész kerületet), de karbantartási csapda: minden jövőbeli hatókör-szigorítás vagy -bővítés némán kihagyja az anyagraktárt. Fordítva is: az esperes ma nem tudja megnézni a gyülekezete anyagraktárát, holott a vizsgálat pont ezt kéri tőle.

#### 🟡 KISEBB — Nincs egyediségi index az anyagtörzsön, és a mozgás utólag nem javítható

**Hivatalos:** A Keszlet lap C oszlopa kulcsként viselkedik (sorszám + név + megjegyzés + ár + mértékegység), a Bevetel/Kiadas lap VLOOKUP-ja erre hivatkozik; a 'Szinek' B7 leírja a törzs utólagos módosításának a következményét és a javítás menetét: „A készlet lapon utólag módosított Anyag megnevezés/megjegyzés/egységár… 1. visszaírni eredeti formába… 2. a bevétel/kiadás lapon az anyag megnevezését újra írni”.

**Kartotéka ma:** A materials táblán csak a `materials_congregation_aktiv_idx` index van (2026-04-18-anyagraktar.sql:90-91), egyediségi megszorítás nincs — ugyanaz a név többször felvehető. A mozgásra nincs update-akció (csak createMaterialMovement + stornoMaterialMovement), így elgépelt dátum/mennyiség csak stornó + újrarögzítés útján javítható.

**Következmény:** Duplikált anyagsorok keletkezhetnek (két „Papír A4”, két külön egyenleggel), amiket a leltárív két külön tételként hoz. A stornó-alapú javítás auditálhatóbb, mint az Excel — ez inkább előny —, de a felhasználót fel kell rá készíteni, mert a hivatalos munkafolyamathoz képest más.

### Ami teljesen hiányzik

- Bevételezési bizonylat nyomtatvány (Kisero_iv lap, 'Bevételezési bizonylat' változat, 2 példány, Átadó/Átadta–Átvette aláírással, „Szám: ÉV / lapszám” fejléccel)
- Anyagraktári kiadási utalvány / kiadási kísérőív nyomtatvány (Kisero_iv lap, 'Anyagraktári kiadási utalvány' változat, 2 példány) — NEM azonos a meglévő pénzügyi Kiadási kísérőívvel
- LELTÁRÍV – ANYAGRAKTÁR / LISTA DE INVENTARIERE nyomtatvány (Leltar_iv lap: kétnyelvű fejléc, 50 sor/lap, választható leltározási dátum, Total/Összesen sor)
- „Anyag raktári készletek” sor a Vagyonleltári jelentés nyomtatványban (előző évi egyenleg / bevétel / kiadás / egyenleg), és a Leltar_iv összegével való kereszt-ellenőrzés (Vagyonleltar_jelentes C14–C18 „Figyelmeztetés!!!”)
- Dátumra vetített (as-of) készlet- és értéklekérdezés — a jelenlegi listMaterials/getAnyagraktarStats dátumszűrő nélkül aggregál
- Fix egységáras készletlap kikényszerítése: árváltozáskor ÚJ anyagsor nyitása (a hivatalos Sugo 15. o. előírása), illetve a mozgás-érték kézi felülírásának korlátozása
- Nyugtatömbök anyagraktárkönyve (chitanta_tombok → anyagraktárkönyv-lap) — a pénzügyi vizsgálaton bemutatandó irat
- Számlatömbök (factura) nyilvántartása és anyagraktárkönyve — a rendszerben egyáltalán nincs számlatömb-entitás
- 30 soros lapozás + „Áthozat az előző lapról” / „Átvitel a következő lapra” sor a nyomtatott anyagraktárkönyvben
- Automatikus iratszám-generálás (ÉV/sorszám, évente 1-től) és többsoros bizonylat (egy nap + egy partner = egy bizonylat, több anyagsorral)
- Kiadás → anyagraktár párosító a 201.08 (Irodaszerek, nyomtatványok) és 201.09 (Fogyóanyagok, más anyagok) jogcímekre — a kapcsolt_kiadas_id FK létezik, de soha nem íródik
- Év-zárolás az anyagraktárra (a véglegesített vagyonleltári év mozgásainak lezárása), és a beküldött jelentés ⇄ élő adat őrszeme
- Mínuszos készlet figyelmeztetése a nyomtatványon és a leltár-összesítőn (ma csak a listasor piros színe jelzi)
- Desktop (Tauri) Anyagraktár oldal + offline szinkron a materials / material_movements táblákra
- Egyediségi megszorítás az anyagtörzsön (congregation_id + név + megjegyzés + egységár + mértékegység)

> **Megjegyzés:** MÓDSZERTANI MEGJEGYZÉSEK ÉS BIZONYTALANSÁGOK.

(1) A hivatalos kivonat sorlimitje. Az Anyagraktarkonyv.txt sheetenként kb. 200 tartalmi sort dump-ol ("[content rows: 200]"), ezért a 'Kiadas' lap 1006–2000. sorainak KÉPLETEI nem látszanak a kivonatban — csak az adatérvényesítésük (type=custom f1='$M1006>=0' sqref=I1006:I2000, type=list f1='cimkiad' sqref=G1006:G2000). A 'Kiadas' lap kétblokkos szerkezetét (6–1000 = a Bevétel tükre a bizonylat-generáláshoz, 1006+ = a tényleges kiadások) a Keszlet lap SUMIF-jeiből vezettem le: N5 a Bevetel-ből, O5 a Kiadas!1006+ tartományból összegez. Ezt a levezetést érdemes az eredeti xlsx-en visszaellenőrizni, mielőtt bármit építünk rá.

(2) Amit NEM állítok eltérésnek. A Kartotéka anyagraktárkönyv-nyomtatványának OSZLOPKÉPE megfelel a hivatalosnak (S.sz | Kelte | Irat száma | Magyarázat | Mennyiség bev/kia/egyenleg | Érték bev/kia/egyenleg), és a Készítette/Ellenőrizte aláírás-blokk is stimmel (Anyagraktar_iv B43/I43). A szerver-akciók fail-closed-ok, az RLS be van kapcsolva, az anon jog visszavonva, a két tábla a mentés-besorolásban is benne van. A negatív készlet a listában piros — vagyis a 'Szinek' lap B6 szabályának a felület megfelel, csak a nyomtatvány nem.

(3) A 2026-os változások hatása erre a területre: NINCS. A Valtozasok_2026.txt (Beke Tivadar, Zabola, 2025.11.28) az A/B változatra szűkítést, a költségvetési tételek egyházmegye-függő legördülőit, az új lelkészi jelentést (IT 65/2025) és a készpénzszabályokat tárgyalja — az anyagraktárkönyvről egy szó sem esik, tehát az Anyagraktarkonyv.xlsx szerkezete változatlan. A készpénzszabályok (50 000 lej kassza-plafon, 1 000 lej decont-előleg, 5 000/10 000 lej határok, feldarabolás tilalma) az anyagraktárt közvetve érintik: az 5 000 lej feletti anyagbeszerzés számláját kötelezően részben átutalással kell fizetni, de ez a pénzügyi modul dolga, nem az anyagraktáré.

(4) A hármas határ (mijloc fix / obiect de inventar / material) hivatalos alapja, amit ellenőriztem: Utmutato_az_EREK_szamadasahoz.txt 205.01 — „Beruházásnak számít minden olyan eszköz megvásárlása, aminek jelenleg az értéke meghaladja a 2500 lejt… 2013. július 1-től van érvényben a 2500 lej értékhatár”; 201.12 — „Kis értékű leltári tárgynak számít jelenleg minden 2500 lejnél kisebb értékű tárgy… Az számít leltári tárgynak, ami külön is mozgatható, elvihető”; 201.08/201.09 — irodaszerek, nyomtatványok, tisztítószerek, fogyóanyagok. A harmadik ág az anyagraktáré: 14_Egyhazi-adminisztracio 6/7. „Minden olyan anyagot, amit nem használnak fel azonnal… be kell vezetni a raktárkönyvbe.” A Kartotéka `INVENTORY_CATEGORIES` (alapeszkoz/telek/csekely/konyv/kegyszer/karpotlasi/bizomanyi) és a román címkék (Mijloace fixe / Obiecte de inventar) helyesek, a 2500 lej küszöb is a helyén van a leltár-oldalon — csak az anyag-ág hiányzik a leképezésből.

(5) Prioritási javaslat (a jelentés nem cselekvési terv, de a sorrend fontos): a két blocker (vagyonleltári jelentés anyagraktár-sora + as-of dátumos készlet) EGYÜTT javítandó, mert ugyanaz a hiányzó képesség két végpontja. A fix áras készletlap kikényszerítése ezután jön, mert visszamenőleg is érinti a már rögzített adatot. A három hiányzó nyomtatvány (bizonylat, utalvány, anyagraktári leltárív) önállóan építhető.

---

## 6. Koltsegvetesi tetelek + "Utmutato az EREK szamadasahoz" (2026) vs. Kartoteka szamadasicel-katalogus, Nr. rand sorszamozas, lelkeszi jelentes VII/VIII

A hivatalos csomag gerince az Adatok_2026.xlsx `Szamadas` munkalapja: 134 FIX sorszamu (Nr. rand, D oszlop) sor. Ebbol 87 visel Capitol/subcapitol kodot (101.01-107.02 = 39 bevetel, 201.01-207.02 = 48 kiadas), 14 csoportsor (101-107, 201-207), a tobbi osszesito/merleg-sor: 1-3 nyito, 36, 41, 52, 95, 96, 99, 100, 101, 112-115, es a 116-134 Tartozasok / Kintlevosegek / Zaroegyenleg blokk. Az Utmutato_az_EREK_szamadasahoz.txt pontosan ezt a sorszamozast magyarazza soronkent. A 2026-os "csak az egyhazmegye neve utan elerhetoek a tetelek" oka is itt latszik: a Koltsegvetes!B78 (egyhazmegye) VLOOKUP(X1:Z25,3)-mal egy 1-4 kozotti MODOT ad (Szamadas!Q101), es ez kapuzza a teteleket. Legenda (Szamadas!R97-R100): 1 = "Erdelyi Kerulet", 2 = "Kolozsvar (kongrua es netto fizetesek elerhetoek)", 3 = "Helyben szamoljak a fizeteseket", 4 = "minden koltsegvetesi tetel elerheto". A Z oszlop szerint a Kolozsvari egyhazmegye = 2, a tobbi erdelyi = 1, a 9 kiralyhagomelleki = 4. VAN tehat egyhazmegye-specifikus tetel-keszlet, es az Excel nem csak elrejti, hanem az N-oszlop 0,001-es trukkjevel (custom data validation) fizikailag tiltja is a beirast a fenntartott sorokba. A Kartoteka katalogusa TARTALMILAG kivalo: a migration-docs/excel-2026-katalogus.json-ban mind a 87 hivatalos kod megvan, egy sem hianyzik, egy sincs tobbletben, es mind a 87 MAGYAR nev byte-azonos a hivatalos Szamadas!C oszloppal (ez a kulcs az Excel write-through SUMIF-jehez). A SORSZAMOZAS viszont szethuz: a nyomtatvany futo szamlalot hasznal, az osszesito sorokat egyaltalan nem szamozza, es a 101 szamozott sorbol 69 rossz szamot kap - koztuk a lelkeszi jelentes VIII. fejezetehez kotott mindharom sor (66., 97., 98. helyett 63., 93., 94.). A VII. fejezet 1./5./7./52./112. sora tartalmilag helyes (a vegosszegek szerkezetileg pont a 41+42+49 = 52. es a 99+102+109 = 112. sort adjak), de a 116. (Tartozasok) es a 128. (Kintlevosegek) blokk teljes egeszeben hianyzik a rendszerbol, a VIII. fejezet harom kotelezo osszege pedig meg sincs mezokent felveve.

### Eltérések

#### ⛔ BLOKKOLÓ — A nyomtatott Nr. rand 69 soron eltér a hivatalostól; a lelkészi jelentés VIII. fejezetének mindhárom hivatkozott sora (66., 97., 98.) rossz számot kap

**Hivatalos:** Adatok_2026.xlsx > Szamadas lap, D oszlop = 'Nr. rând / Sorszám', FIX 1-134. Konkrétan: D166=66 (201.13 Reparatii curente / Karbantartási kiadások), D197=97 (205.01 Investitii noi / Új beruházások), D198=98 (205.02 Reparatii capitale / Általános javítások). A 36. (Total venituri proprii), 41. (Total), 52. (Total incasari), 95., 99., 100., 101., 112. (Plati totale), 113-115. sorok ÖNÁLLÓ sorszámot viselő összesítő sorok. Az Utmutato_az_EREK_szamadasahoz.txt 1-13. oldala soronként ezt a számozást magyarázza.

**Kartotéka ma:** packages/ui-app/src/finance/budget-reporting.ts:655-673 (buildSectionRows) - a Nr. rând egyszerű futó számláló (`n++`) a jelenlévő cellákon; packages/ui-app/src/finance/budget-reporting.ts:878-902 (totRow) - a három végösszeg-sor `colspan`-os, sorszám-cella NÉLKÜL. Szimulációval (87 levél + 14 csoport, cmpId rendezés, startNum=4): az első eltérés a 105 csoportnál (Kartotéka 36 vs hivatalos 37), és onnantól kumulálódik: 201.13 -> 63 (66 helyett), 205.01 -> 93 (97), 205.02 -> 94 (98), 207.02 -> 104 (111). 101 számozott sorból 69 rossz.

**Következmény:** Az esperesi hivatal a számadásokat SORSZÁM szerint összesíti, és a hivatalos Súgó a lelkészt sorszámra küldi ('a számadás 97. sora'). A Kartotékából nyomtatott, ALÁÍRT íven a lelkész a 97. sornál az Új beruházások helyett a 206.01-et találja. A VIII. fejezet A/B/C összegei így garantáltan rossz sorból kerülnek át.

#### ⛔ BLOKKOLÓ — A 116. (Tartozások / Datorii) és 128. (Kintlévőségek / Creante) sorblokk, és vele a 134. Záróegyenleg, egyáltalán nincs a rendszerben

**Hivatalos:** Szamadas!B216='Datorii\nTartozások (117+ ... +127)' D216=116, részletező sorok 117-127 (Központi járulék, Bérjövedelmek 10%-a, Fizetés alap, Közköltségek, Javadalmak..., Kapott hitelek, Más tartozások). Szamadas!B228='Creante\nKintlevőségek (129 + ... + 133)' D228=128, részletezők 129-133. Szamadas!B234='Sold\nZáróegyenleg\n(113-116+128)' D234=134, G234='=SUM(G213,-G216,G228)'. Az Utmutato 116. sorának magyarázata: 'A jegyzőkönyvbe nem vett tartozásokat nem lehet kifizetni a következő évben. Ha nincs tartozás, akkor jegyzőkönyvezni kell azt is, hogy nincs tartozás.'

**Kartotéka ma:** packages/ui-app/src/finance/budget-reporting.ts:1043-1074 (buildSzamadasExtraRows) - a Számadás záró blokkja CSAK 'Sold la finele anului' + Casa + Banca sort ad (a Casa/Banca ott ráadásul '—'). Nincs Datorii/Creante tábla sem a nyomtatványban, sem a `koltsegvetes` táblában (migration-docs/Database_schema.sql:366-379: bealitasid, szamadasicelid, osszeg, osszeg_modositott, osszeg_mod_2/3, osszeg_teny). A grep 'Datorii|Creant' a finance modulban nulla találat.

**Következmény:** A rendszerből nyomtatott számadás alapján a lelkész nem tudja a tartozásait jegyzőkönyveztetni, tehát a következő évben jogszerűen ki sem fizetheti őket. A lelkészi jelentés VII.3.e (Kintlévőségek) és VII.3.f (Tartozások) rubrikái forrás nélkül maradnak, és a hivatalos Zárás (d+e-f) sor sem számolható.

#### 🔴 SÚLYOS — A költségvetési tételek egyházmegye-függősége hiányzik: a Kartotéka országosan azonos, fix szint-listát használ

**Hivatalos:** Valtozasok_2026.txt: 'A költségvetési tételek az egyházmegye neve beírása után lesznek elérhetőek a lenyílókban.' Mechanizmus: Koltsegvetes!B78 (data validation: list, f1='$X$1:$X$24') -> Szamadas!Q101='=VLOOKUP(Koltsegvetes!B78,Koltsegvetes!X1:Z25,3,FALSE)'. Kapuk: Q140/I140 (105.03 Kongrua) csak ha mód>1; Q168/I168 (201.15 Nettó fizetések) csak ha mód>1; I169-I172 (201.16-201.19) csak ha mód>=3; Q111/Q112, Q144-Q148, Q204-Q208 (101.07, 101.08, 106.02-106.06, 206.02-206.06) csak ha mód=4. Z-oszlop: Kolozsvári=2, többi erdélyi=1, a 9 királyhágómelléki=4. R101='Egyházmegye részére fenntartott tétel, egyházközség ide nem tervezhet.'

**Kartotéka ma:** migration-docs/sql/2026-04-17-szamadasicel-szint.sql - a `szamadasicel.szint` GLOBÁLIS oszlop, 18 nevet fixen 'egyhazmegye'-re állít, gyülekezettől/egyházmegyétől függetlenül. packages/core/src/finance/befizetes/list-cel.ts fejkomment: 'minden gyülekezet ugyanazt használja, nem congregation-scope'. A szűrő packages/ui-app/src/finance/types.ts:555 isGyulekezetiKonyvelhetoKod(kod, szint) - nincs benne congregation- vagy diocese-paraméter. A congregations táblában VAN diocese_id és egyhazmegye oszlop (Database_schema.sql), csak a pénzügy nem használja.

**Következmény:** A KOLOZSVÁRI egyházmegye gyülekezetei a hivatalos Excelben könyvelhetnek a 105.03 Kongrua és a 201.15 Nettó fizetések tételre, a Kartotékában NEM (a legördülőből kiesik). Aki helyben számol fizetési jegyzéket, a 201.16-201.19-hez sem fér hozzá. Ez a pénz némán kimarad a Kartotéka Számadásából, miközben az Excel-alapú számadásban benne van - két, egymásnak ellentmondó hivatalos ív ugyanarra az évre.

#### 🔴 SÚLYOS — A lelkészi jelentés VIII. fejezetének három kötelező összege (A/B/C = 97./98./66. sor) nincs mezőként felvéve; a VIII. fejezet két szabadszöveg

**Hivatalos:** Lelkeszi_jelentes.xlsx > 'Sugo_lelkeszi jelenteshez': C214/D214 = 'A. Új ingatlanberuházás (új építkezés, ingatlanvásárlás) értéke' -> 'a számadás 97. sorából a csoportnapló alapján külön választani az ingatlanokra vonatkozó részt'; C216/D216 = 'B. Épületek általános javítására költött összeg' -> 'a számadás 98. sora'; C218/D218 = 'C. Épületek karbantartására fordított összeg' -> 'a számadás 66. sora'. A 'Jelentes' lap B200 = A+B+C összeg (Q200='=SUM(Q191,Q194,Q197)'), B201 (VIII.3.) = alapeszköz-beszerzés 2500 lej felett (R201=2500), B203 (VIII.4.) = adományba kapott ingatlan/alapeszköz értéke, B205 (VIII.5.) = elidegenítés IGEN/NEM. Az IT 65/2025 szerint 2026-tól KÖTELEZŐ.

**Kartotéka ma:** apps/web/lib/lelkeszi-jelentes/types.ts:221-222 - a teljes VIII. fejezet két mező: VIII.1 'Ingatlanok állapota, változások' és VIII.2 'Építkezés, felújítás az évben', mindkettő tipus:'hosszu_szoveg', auto:false. Nincs szám-mező, nincs 66./97./98. kötés, nincs A+B+C összegzés, nincs IGEN/NEM. Az ingatlan/nem-ingatlan bontás sem vezethető le: apps/web/lib/constants/inventory.next.ts:1-9 - a leltár kategóriái alapeszkoz/telek/csekely/konyv/kegyszer/karpotlasi/bizomanyi, NINCS épület/ingatlan kategória, pedig a 205.01 -> leltár kapcsolat létezik (packages/ui-app/src/finance/helpers.ts:61).

**Következmény:** A 2026-tól kötelező űrlap felét a lelkésznek kézzel kell kiszámolnia a nyomtatott számadásból - amelyen ráadásul rossz sorszámok állnak. A VIII.2.A (ingatlan-rész a 97. sorból) automatikusan elő sem állítható, mert a leltár nem különbözteti meg az épületet a többi alapeszköztől.

#### 🔴 SÚLYOS — A VII.9 'Kintlévőség (járulék-hátralék)' felirat pont azt kéri, amit az Útmutató kifejezetten kizár

**Hivatalos:** Utmutato_az_EREK_szamadasahoz.txt, 133. sor (Alte creante / Más kinnlevőségek): 'Nem számítható be kinnlevőségnek a kintlevő egyházfenntartói járulék, mivel nem tervezhető és nem behajtható. Pl. ha egy sok tartozással rendelkező család áttér más felekezetbe, akkor tartozásuk soha sem fog bejönni a pénztárunkba. Nem számíthatnak kinnlevőségnek a csak megígért adományok, perselypénz stb.'

**Kartotéka ma:** apps/web/lib/lelkeszi-jelentes/types.ts:217: { id: 'VII.9', label: 'Kintlévőség (járulék-hátralék)', tipus: 'szam', auto: false }. A Pénzügy modul 'Tartozások' fül (packages/ui-app/src/finance/FinanceSugoTab.tsx:227, 971) éppen ezt a járulék-hátralékot listázza, tehát a lelkész pontosan ezt a számot fogja beírni.

**Következmény:** A kintlevő járulék bekerül a Creante (128.) rubrikába, ezért a 134. Záróegyenleg felfelé hazudik, és az esperesi hivatal az összesítéskor visszaküldi a jelentést. A hiba iránya SZISZTEMATIKUS: minden gyülekezetnél pozitív irányban torzít.

#### 🔴 SÚLYOS — A Költségvetés-módosítás nyomtatványról hiányzik az 1-3. nyitósor, ezért a sorszámozása további 3-mal csúszik a Költségvetéshez képest

**Hivatalos:** A Költségvetés és a Költségvetés-módosítás UGYANAZ a lap: Koltsegvetes!B80 lenyíló (AF1:AF4 = 'Költségvetés' / '1./2./3. Költségvetés módosítás'), és a lap sorai a Számadásból jönnek: Koltsegvetes!B101='=Szamadas!B101', D101='=Szamadas!D101' (D101=1 = Disponibil din anul precedent). Tehát a módosítás íve is az 1-134 számozást viseli, benne az 1-3. nyitósorral.

**Kartotéka ma:** packages/ui-app/src/finance/budget-reporting.ts:370 - `collectBudgetRows(data, 'modification')`, `openingRows` NÉLKÜL, tehát a 806-831. sor nyitóblokkja kimarad és startNum=1 marad. A 354. (koltsegvetes) és 386. (szamadas) ág átadja az `openingRows: true`-t, de a 806. sorban további feltétel: `data.carryoverCash != null || data.carryoverBank != null`.

**Következmény:** Ugyanarra az évre, ugyanarra a gyülekezetre a Költségvetés (101 = 4. sor) és a Költségvetés-módosítás (101 = 1. sor) EGYMÁSNAK is ellentmondó sorszámot nyomtat. Két beküldött, aláírt hivatalos ív, amelyeket az egyházmegye nem tud egymásra fektetni.

#### 🟠 KÖZEPES — A hivatalos Súgó 116/128 hivatkozása FEL VAN CSERÉLVE - a Kartotéka VII/VIII bekötésekor ez a csapda

**Hivatalos:** Lelkeszi_jelentes.xlsx > 'Sugo_lelkeszi jelenteshez': C208='e. Kintlévőségek:' D208='a számadás 116. sora'; C209='f. Tartozások:' D209='a számadás 128. sora'. DE a Szamadas lapon B216/D216 = 'Datorii / Tartozások' = 116. sor, B228/D228 = 'Creante / Kintlevőségek' = 128. sor. Ellenőrzés a képlettel: a Jelentes lap Q183 ('g. Zárás (d+e-f)') = '=SUM(Q180,Q181,-Q182)', ami csak akkor egyezik a hivatalos 134. sorral (G234='=SUM(G213,-G216,G228)' = 113-116+128), ha e = 128 (Creante) és f = 116 (Datorii). A Súgó tehát téved.

**Kartotéka ma:** Jelenleg nincs 116/128 hivatkozás sehol a kódban (lásd a Datorii/Creante hiányát), így a Kartotéka még nem másolta le a hibát. A VII.3.e/f bekötésekor viszont a fejlesztő a Súgót fogja olvasni.

**Következmény:** Ha a fejlesztés a Súgó szövegét követi, a kintlévőség és a tartozás FELCSERÉLVE kerül a jelentésbe, és a Zárás (d+e-f) sor előjelesen fordítva számol. Ezt a döntést dokumentálni kell a kódban, különben egy későbbi 'javítás' visszateszi.

#### 🟠 KÖZEPES — A hivatalos '*' jelölés (egyházmegyének fenntartva) lekopott a román megnevezésekről, és 35 román név szövegesen eltér

**Hivatalos:** A Szamadas B-oszlopában a fenntartott tételek román neve csillaggal végződik: B111='Contributia pt. sustinerea unit. Ierarhic superioare* ', B140='Subventii primite pt. salarii*', B168='Salarii nete*', B204='Asigurari*' stb. (11 db a katalógusban szereplők közül). A csillag jelentése az R101 szövege: 'Egyházmegye részére fenntartott tétel, egyházközség ide nem tervezhet.'

**Kartotéka ma:** migration-docs/excel-2026-katalogus.json - gépi diff a hivatalos Szamadas!B/C oszlopok ellen: mind a 87 KÓD és mind a 87 MAGYAR név byte-azonos (erősség, ez az Excel SUMIF kulcsa), de a `ro` mezőkből 11-ben hiányzik a '*', és 35-ben valódi szöveg-eltérés van, pl. 101.01 'Contributia anuala' -> 'Contr. anuala'; 'pentru' -> 'pt.' (101.08, 201.01, 201.17, 201.19, 202.04, 202.05, 202.06, 102.04); kisbetű/nagybetű: 105.03 'salarii' -> 'Salarii', 106.05 'parohii' -> 'Parohii', 202.03 'presbiterilor' -> 'Presbiterilor', 203.04 'conferinte' -> 'Conferinte'. A nyomtatvány ezt a `nevro`-t írja a román oszlopba (budget-reporting.ts roName()).

**Következmény:** Az aláírt, román nyelvű Számadás-oszlop nem betűhű a hivatalos ívvel, a fenntartott sorok vizuális jelölése pedig eltűnik - a lelkész nem látja a papíron, hogy melyik sor nem az övé.

#### 🟠 KÖZEPES — A szamadasicel.sorszam / sorszamok oszlop létezik, de a kód sehol nem olvassa - a helyes Nr. rand tárolóhelye üresen áll

**Hivatalos:** A Nr. rand (1-134) NEM vezethető le a kódból: az összesítő sorok (36, 41, 52, 95, 99, 100, 101, 112) és a merleg-blokk (113-134) sajat sorszamot visznek, es a 105/106/107 csoportok emiatt csúsznak. A hivatalos ív tehát egy fix kód -> sorszám leképezést igényel.

**Kartotéka ma:** migration-docs/Database_schema.sql:551-552 - `sorszam integer NOT NULL, sorszamok character varying` a szamadasicel táblán. A `grep -rn sorszamok` az egész repóra CSAK a két séma-dumpot adja vissza (Database_schema.sql és source-links/Database_schema.sql); a `sorszam` mezőt a packages/ui-app/src/finance/budget-reporting.ts nem hivatkozza egyszer sem.

**Következmény:** A javítás nem igényel séma-változtatást - de csak akkor, ha a tárolt `sorszam` értékek TÉNYLEG a hivatalos Nr. rand-ot hordozzák. Ezt a rendszer ma nem ellenőrzi, és senki nem is látja.

#### 🟠 KÖZEPES — A VII.5 (előző évi egyenleg = a számadás 1. sora) kézi mező, pedig a rendszer ismeri az adatot

**Hivatalos:** Sugo_lelkeszi jelenteshez C205/D205: 'a. Előző évi egyenleg:' -> 'a számadás 1. sora'. A fejezet-fejléc D202 kiköti: 'Ezt a fejezetet a számadás alapján kell kitölteni, és azonos számokat kell tartalmaznia a számadással'. Szamadas!D101=1, F101/G101='=SUM(F102:F103)' = Casa (2. sor) + Banca (3. sor).

**Kartotéka ma:** apps/web/lib/lelkeszi-jelentes/types.ts:213: { id: 'VII.5', label: 'Zárszámadás — előző évi maradvány (a)', auto: false }. Ugyanezt az összeget a nyomtatvány automatikusan előállítja: packages/ui-app/src/finance/budget-reporting.ts:806-816 (`data.carryoverCash + data.carryoverBank`), az érték forrása apps/web/app/(dashboard)/penzugy/actions.ts:644-648.

**Következmény:** A lelkész kézzel másol át egy számot, amit a rendszer tud - és mivel a VII.8 (a+b-c) ebből számol, egy elgépelés a jelentés egyenlegét is elrontja, miközben a Súgó azonosságot ír elő a számadással.

#### 🟠 KÖZEPES — A hivatalos VII. fejezet 4. és 5. pontja, valamint a 'g. Zárás (d+e-f)' sor nincs a modellben

**Hivatalos:** Lelkeszi_jelentes.xlsx > 'Jelentes': A184/B184 = '4. Az egyházközség eleget tudott-e tenni időben a kifizetési kötelességeinek?' (Súgó D210: '[IGEN/NEM] lehetőségek közül választhatsz'); A185/B185 + B186 = '5. Ha az egyházközségnek tartozása van, kérjük részletezni' (Súgó D211: 'A feljebb, VII.3.f. ponthoz beírt tartozásokat kell részletezni'); C183/F183 = 'g. Zárás (d+e-f)', Q183='=SUM(Q180,Q181,-Q182)'.

**Kartotéka ma:** apps/web/lib/lelkeszi-jelentes/types.ts:206-218 - a VII. fejezet mezői VII.1..VII.10. A VII.8 = a+b-c (ez a hivatalos 'd'), de 'g' nincs; nincs IGEN/NEM tipusu mezo; nincs tartozas-reszletezo szoveg. A VII.10 'Kifizetési kötelezettségek' szám-mező viszont nevében a hivatalos 4. pont (IGEN/NEM kérdés) szövegére hajaz, tartalmában viszont a 3.f (Tartozások szám) helye lenne - a két szerep összecsúszott.

**Következmény:** A 2026-tól kötelező űrlap VII. fejezete nem tölthető ki hiánytalanul a rendszerből, és a VII.10 mező jelentése kétértelmű: a lelkész nem tudja, számot vagy választ vár-e.

### Ami teljesen hiányzik

- Az ELO adatbazis szamadasicel tablajanak tartalma. A migration-docs/excel-2026-katalogus.json csak repo-artefaktum (a memoria HIBAOSZTALYA szerint a repo es a produkcio nemán szethuz). Nem tudom, hogy a 87 level- + 14 csoport-kod tenylegesen bent van-e, mit tartalmaz a sorszam / sorszamok oszlop, es hogy a szamadasicel.nev valoban byte-azonos-e a hivatalossal (ez az Excel write-through SUMIF-kulcsa). Lasd az 1-3. SQL-t.
- A szamadasicel.szint tenyleges eloszlasa elesben: a 2026-04-17-i migracio 18 tetelt allitana at, de a memoria szerint az SQL-ek egy resze meg nem futott le mindenhol. Lasd a 4. SQL-t.
- Van-e olyan gyulekezet a rendszerben, amelyik a Kolozsvari egyhazmegyehez tartozik (mod=2), es igy a hivatalos Excelben konyvelhetne kongruara / netto fizetesre. Lasd az 5. SQL-t.
- A hivatalos konyveles-segedlet 'A' (nagy gyulekezet) es 'B' (kis gyulekezet) valtozata KOZTI kulonbseg. A Valtozasok_2026.txt szerint mindketto tartalmaz mindent, amit korabban a C es D, de a szoveges kivonatokbol nem derul ki, hogy a tetel-keszlet elter-e. A kodbazisban semmi nyoma az A/B valtozatnak.
- A Szamadas!Q99 = 3-as mod ('Helyben szamoljak a fizeteseket') egyetlen egyhazmegyehez sincs rendelve a 2026-os Z-oszlopban (Z ertekek: 1, 2, 4). Nem tudom, hogyan erhet el egy helyben szamolo gyulekezet a 201.16-201.19 tetelekhez - lehet, hogy kezi Z-atirassal, vagy ez a mod 2026-ban holt ag.
- A Kimutatasok_2026.xlsx Csoportnaplo munkalapjanak belso szerkezetet nem nyitottam meg, ezert nem tudom, a hivatalos munkafuzet pontosan hogyan valasztja kette a 97. sort ingatlan / nem-ingatlan reszre (VIII.2.A vs VIII.3).
- A desktop (Tauri) nyomtatasi ag: csak az apps/desktop/src/components/budget-print-dialog.tsx letezeset ellenoriztem, a sorszamozas paritasat nem. Ha sajat masolata van a sor-epitesnek, ott kulon is elofordulhat a drift.

> **Megjegyzés:** MODSZER: eloszor a hivatalos forrast dolgoztam fel (Utmutato_az_EREK_szamadasahoz.txt teljes 13 oldala, Adatok_2026.txt Szamadas + Koltsegvetes lapja, Lelkeszi_jelentes.txt Jelentes + Adatlap + Sugo lapja, Valtozasok_2026.txt), majd a Kartoteka adatlancat kovettem: UI (BudgetTab/AccountingTab) -> nyomtatvany-builder (budget-reporting.ts) -> katalogus (excel-2026-katalogus.json) -> tabla (szamadasicel/koltsegvetes) -> szint-migracio. A katalogus-osszevetest GEPILEG vegeztem (nem szemre): a hivatalos Szamadas!B/C/D/E oszlopokbol kinyert 87 sort diffeltem az excel-2026-katalogus.json ellen, es a sorszamozast a buildSectionRows logikajanak ujraimplementalasaval szimulaltam. Eredmeny: 0 hianyzo kod, 0 tobblet kod, 0 magyar nev-elteres, 46 roman nev-elteres (ebbol 11 csak a hianyzo * jeloles), es 69 hibas Nr. rand a 101 szamozott sorbol.

FONTOS ERZOSSEG, amit nem szabad elrontani a javitassal: a 87 magyar nev BYTE-AZONOS a hivatalossal. Ez az Excel write-through (packages/core/src/finance/excel/row-builder.ts) I/K oszlopanak SUMIF-kulcsa, es a desktop mar helyesen kezeli a Koltsegvetes!B78-at is (apps/desktop/src/lib/excel-settings.ts:138-149: KOLTSEGVETES_MEGYE_CELL + a hivatalos 24 egyhazmegye-nev). Az egyhazmegye-fuggoseget tehat a desktop Excel-ag MAR ISMERI - csak a Kartoteka sajat penzugyi katalogusa nem.

A 927 elemu katalogus felepitese: 87 hivatalos EREK-kod + 420 (300.01-320.20) + 420 (400.01-420.20) belso-mozgas slot. A 3xx/4xx blokk NEM tobblet a hivatalos ivhez kepest: a nyomtatvany es a kepernyo is kizarja (isSzamadasIvKod, budget-reporting.ts:262-266), es a memoria szerint ebbol csak 5 kod kanonikus (300.01/301.01/400.01/401.01/402.02), a tobbi deaktivalva.

TECHNIKAI ESZREVETEL: a hivatalos Excel a 201.10 kodot E163=201.1 NUMERIKUS ertekkent tarolja (Excel levagja a zarot). A Kartoteka '201.10' stringet hasznal - ez helyes, es nem okoz gondot, mert az Excel SUMIF a NEV szerint aggregal, nem a kod szerint.

TOVABBI TECHNIKAI ESZREVETEL: az Utmutato 11. oldalan a "Credite Hitelek (111+112)" felirat elgepeles - a 109. sor kepletet a Szamadas!F209='=SUM(F210:F211)' adja, tehat helyesen (110+111). A Kartoteka szamitasa (groupsOf + sumGroup) szerkezetileg helyes.

SEMMIT NEM MODOSITOTTAM. Egyetlen ideiglenes fajlt irtam a scratchpadba (official.tsv, a gepi diffhez).

---

## 7. Kimutatasok_2026 — a nyomtatványok és a kötelező nyomtatási rend

A hivatalos Kimutatasok_2026.xlsx hat munkalapból áll, ebből öt nyomtatható: `Kiadasi_kiseroiv`, `Fo_konyv` (REGISTRUL-JURNAL DE ÎNCASĂRI ŞI PLĂŢI), `Naplo` (REGISTRU CASĂ / REGISTRU BANCĂ, számla- és hónap-legördülővel, benne a „Jan - Dec" éves opció), `Csoportnaplo` és `Resz_szamadas`; a `Cs` lap csak csatolási segédlap („Ez a csatolás munkalap.", Cs!B6). A Valtozasok_2026.txt 20–30. sora írja elő a nyomtatási rendet: napi kasszakönyv NEM, havi kasszakönyv IGEN, kiadási kísérőív készpénzes ÉS banki kifizetés mellé is, havi banki extras IGEN, banknapló csak év végén Jan_Dec változatban, csoportnapló csak az év lezárása után, a Főkönyv KÖTELEZŐ, két oldalasan, 5 évente vagy 200 laponként bekötve. Tartalmilag mind az öt nyomtatványnak VAN megfelelője a Kartotékában (FINANCE_PRINT_TYPES: registru_casa, registru_banca, registru_jurnal, csoport_naplo, kiadasi_kiseroiv + BUDGET_PRINT_TYPES: reszszamadas), tehát teljesen hiányzó kimutatás NINCS. A kinézet viszont több ponton érdemben eltér: a hivatalos lapok fix sor/lap kerettel (Fo_konyv 40, Naplo 40, Csoportnaplo 50, Kiadasi_kiseroiv 20) és laponkénti áthozat/átvitel + oldalszám blokkal dolgoznak, a Kartotéka regiszterei viszont hónaponként EGYETLEN, korlátlanul növő lapot állítanak elő beégetett „pg. 1"-gyel. A kiadási kísérőíven a „Kiad. sz." a hivatalos évente futó kiadás-sorszám helyett laponként 1-től indul, és a bizonylat desktopon egyáltalán nem érhető el. Ezen felül hiányzik a „Simb. cont." oszlop mindhárom regiszterből, a laponkénti egyenleg-átvezetés, a Registrul-Jurnal bankszámla-betűje és a „Sold total (6+7)" sora, valamint a két nyomtatási modul (reporting.ts / budget-reporting.ts) eltérő számformátumot használ ugyanarra az évre.

### Eltérések

#### ⛔ BLOKKOLÓ — Főkönyv (Registru Jurnal): nincs valódi lapozás, sem lapszám — a KÖTELEZŐ, bekötendő főkönyv így nem állítható elő

**Hivatalos:** Kimutatasok_2026.xlsx / 'Fo_konyv': M3=40 (40 sor/lap), a lapzáró blokk F52–F55 az U1–U7 feliratokkal: U1='Total luna', U2='Total rulaj', U3='Sold numerar(6-8) / Sold bancă (7-9)', U4='De reportat pagina:', U6='Report pagina precedentă: ' (F56), U7='Sold total (6+7)'; a lábléc K55='="pg. "&N55'. Valtozasok_2026.txt 28–30. sor: „Kötelező kinyomtatni a Főkönyvet (Registru Jurnal), lehetőleg két oldalasan… öt évenként, vagy 200 lap terjedelmet követően kemény laptáblába beköttetjük.” Ugyanez a 14_Egyhazi-adminisztracio…txt 711–714. sorban.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:563–589 (buildRegistruJurnal) — a teljes hónap EGYETLEN `<div class="page">`-be kerül, a lábléc `<div class="page-num">pg. 1</div>` beégetve (reporting.ts:588). Éves módban reporting.ts:1210–1227 hónaponként ad egy oldalt, és reporting.ts:1224 `pageContent.replace(/pg\.\s*1/, 'pg. N')` — hónaponként EGY oldalszám, függetlenül attól, hány papírra folyik szét.

**Következmény:** Egy 40 sornál hosszabb hónap némán 2–8 fizikai lapra tördelődik a böngészőben, mindegyiken ugyanaz a „pg. N”, a 2. laptól kezdve fejléc és lapszám nélkül. A bekötött, folyamatosan lapszámozott főkönyv (5 évente / 200 laponként) így nem egyeztethető, és az egyházmegyei vizsgálaton nem fogadható el.

#### ⛔ BLOKKOLÓ — Kiadási kísérőív: a „Kiad. sz.” laponként 1-től indul az évente futó kiadás-sorszám helyett

**Hivatalos:** 'Kiadasi_kiseroiv' A8='=IF(AND($M$1>=M8,$M$1>0),M8,"")', ahol M8='=SUM(N1,M7)' és N1='=MIN(Cs!BS7:BS33000)' — a kiválasztott számla (Kassza / A - számla …) év eleje óta futó kiadás-sorszáma. A fejléc E6='=TRIM(J5&J6&J7)', J5='=IF(N1=M1,N1&" sz. kiadás","")', J6='=IF(N1<M1,N1&" - "&M1&" sz. kiadások   ","")' — vagyis a lapon szereplő kiadás-sorszám TARTOMÁNYA.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:630 `<td class="text-center">${i + 1}</td>` — a Kiad. sz. minden íven 1-től újraindul. A fejléc reporting.ts:648 `${pageNumber}. sz. kiadás ${fmtDate(date)}` — itt a `pageNumber` a kiadásos NAPOK indexe (apps/web/components/finance/kiseroiv-print-dialog.tsx:86–96), nem kiadás-sorszám.

**Következmény:** Az iratgyűjtőben a kiadási irat nem hivatkozható egyértelmű éves sorszámmal (minden nap van „1. kiadás”), a fejléc pedig a lap sorszámát mondja kiadás-sorszámnak. A hivatalos főkönyv/kísérőív kereszthivatkozása megszakad.

#### 🔴 SÚLYOS — A kötelező kiadási kísérőív desktopon egyáltalán nem nyomtatható

**Hivatalos:** Valtozasok_2026.txt 22–23: „Ki kell nyomtatni a kiadási kísérőívet a készpénzes és a banki kifizetések mellé is.” Sugo.txt 369: „Minden kiadás mellé kötelezően ki kell nyomatni kiadási kísérőívet.” 14_Egyhazi-adminisztracio…txt 887: „Minden kiadási nyugta mellé csatolni kell a kiadási utalványt, amit a lelkipásztor és a (fő)gondnok ír alá.”

**Kartotéka ma:** apps/desktop/src/components/finance-print-dialog.tsx:148 kizárja a típust (`FINANCE_PRINT_TYPES.filter((t) => t.id !== 'kiadasi_kiseroiv')`), és NINCS desktop kísérőív-dialógus (a `grep -rli kiseroiv apps/desktop/src` egyedül ezt a szűrősort találja). A desktop apps/desktop/src/pages/penzugy-page.tsx:869–879 a közös TransactionsTab-ot `kiseroivPrintDialogSlot` NÉLKÜL adja át, a gomb pedig e slot meglétéhez kötött: packages/ui-app/src/finance/TransactionsTab.tsx:659 `{hasExpenseOnDay && kiseroivPrintDialogSlot && (…)}`. Weben megvan: apps/web/components/finance/kiseroiv-print-dialog.tsx + transactions-tab.tsx:129.

**Következmény:** Aki offline, desktopon könyvel, a kötelező bizonylatot sehol nem tudja kinyomtatni — a gomb meg sem jelenik. A kiadási iratgyűjtő hiányos marad.

#### 🔴 SÚLYOS — Registru Casă / Registru Bancă: nincs 40 soros lapozás, sem laponkénti „TOTAL PAGINA” / „Sold pagina precedentă”; az éves (Jan_Dec) banknaplóból hiányzik az éves TOTAL

**Hivatalos:** 'Naplo' P2=40 (40 sor/lap); a lapzáró E51='=IF(L50<$P$3,$O$5,IF(L50=$P$3,$N$5,""))' ahol O5='TOTAL PAGINA' és N5='=IF(N1=AA13,"TOTAL","TOTAL LUNA")'; a következő lap nyitósora E53 = U2='Sold pagina precedentă: '; lábléc I52='="pg. "&K52'. Az AA1:AA13 legördülő 13. eleme AA13='Jan - Dec' (AC13=' PERIOADA IANUARIE - DECEMBRIE'). Valtozasok_2026.txt 25–27: „A banknaplót a kimutatások munkafüzetből csak év végén kell nyomtatni, éves változatban, a lenyílóból a Jan_Dec opciót választva.”

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:364–388 (Casa) és 446–470 (Banca): egyetlen lap, csak `Sold luna precedenta` (377/459) és `TOTAL LUNA` (379/461), lábléc `pg. 1` (387/469). Éves módban reporting.ts:1210–1227 hónaponként külön oldalt fűz össze, hónaponkénti sorszámozással (`i + 1`) — ÉVES összesítő („TOTAL”) sor sehol nincs.

**Következmény:** Az év végén kötelezően nyomtatandó éves banknapló nem a hivatalos, folytonos éves változat, hanem 12 különálló havi lap. A 40 soron túli hónap ugyanúgy szétfolyik, mint a főkönyv, laponkénti egyenleg-átvezetés nélkül.

#### 🔴 SÚLYOS — Kiadási kísérőív: nincs 20 soros lapozás, és az oldalszám a napokat számolja, nem a lapokat

**Hivatalos:** 'Kiadasi_kiseroiv' M2='=ROUNDUP(O1/20,0)' (20 sor/lap), a figyelmeztetés A2='=IF(M2>1,L1&M2&L2&M3&L3,"")' L1='Ezen a napon összesen ', L2=' kiadási kísérőív lap van. Ebből jelenleg a(z) '; a lábléc F33='="pg. "&M4', ahol M4='=IF(ISERROR(VLOOKUP(K2,BE1:BG366,3,FALSE))=FALSE,VLOOKUP(K2,BE1:BG366,3,FALSE)+M3,1)' — az év eleje óta futó LAP-sorszám (BF2='=ROUNDUP(COUNTIF(Cs!$BT$7:$BT$33000,BE2)/20,0)').

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:644–665 — a nap összes tétele EGY `<div class="page page--bottom-footer">`-be kerül, a lábléc `pg. ${pageNumber}` (664). A `pageNumber` a kiadásos napok indexe: apps/web/components/finance/kiseroiv-print-dialog.tsx:86–96 (`days` halmaz + `sorted.indexOf(date) + 1`).

**Következmény:** 20 tételnél hosszabb napon a lap túlcsordul (az aláírás-sáv és az összesítő átcsúszik), és mivel egy ilyen nap hivatalosan 2 lap, a Kartotéka oldalszám-sorozata onnantól tartósan eltér a hivatalostól.

#### 🟠 KÖZEPES — Hiányzik a „Simb. cont.” (költségvetési tétel) oszlop mindhárom regiszterből

**Hivatalos:** 'Fo_konyv' K8='Simb.' + K9='cont.', és a K10=10 oszlopszám szerint ez a hivatalos 10. oszlop; képlete K12='=IF($O$2>=M12,VLOOKUP(V12,Csfi,2,FALSE),"")'. 'Naplo' I7='Simb.' + I8='cont.', I9=9 (9. oszlop).

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:348–349, 440 és 529 kommentek: „2026-07-10 (S3 #1b): a »Simb. cont.« (költségvetési szám) oszlop ELTÁVOLÍTVA a felhasználó kérésére — a hivatalos regiszteren nem szükséges.” A thead-ekben (372–374, 454–456, 571–573) valóban nincs ilyen oszlop.

**Következmény:** A regiszterből soronként nem olvasható ki a költségvetési tétel, így az ellenőr nem tudja a naplót a számadással soronként egyeztetni. A döntés tudatos volt, de a hivatalos űrlaptól eltér — érdemes újratárgyalni.

#### 🟠 KÖZEPES — Registru Casa oszlopszámozása eltér a hivatalostól (a Numar kettébontva Nr. ker. / Nr. gyül.-re)

**Hivatalos:** 'Naplo' A7='Nr' B7='Data' C7='Document' E7='Explicaţii' F7='Sume' H7='Sold' I7='Simb.'; A8='crt' B8='inreg.' C8='Fel' D8='Numar' F8='Incasate' G8='Platite' H8='zi' I8='cont.'; a 9. sor a hivatalos oszlopszámozás: A9=1 … I9=9.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:372–374 — `<th>Fel</th><th>Nr. ker.</th><th>Nr. gyül.</th>` (a kerületi és a gyülekezeti nyugtaszám külön oszlopban), és alatta ugyanúgy 1..9 számozás, de a Simb. cont. helyett. A Registru Bancánál (455–456) csak 1..8 számozás fut, szemben a hivatalos 9-cel.

**Következmény:** A nyomtatott oszlopszámok (1..9) más tartalmat jelölnek, mint a hivatalos űrlapon — a jogszabályi hivatkozások (pl. „Sold numerar (6-8)”) félreolvashatók, és a Registru Banca számozása egy oszloppal elcsúszik.

#### 🟠 KÖZEPES — „Sold zi” oszlop: hivatalosan NAPI záró egyenleg, a Kartotékában soronkénti futó egyenleg

**Hivatalos:** 'Naplo' H11='=IF(AND(N11<>N12,N11<>" "),SUM($F$10:F11)-SUM($G$10:G11),IF(L10=$P$3,H10,""))' — N11/N12 a sor és a KÖVETKEZŐ sor dátuma, tehát az egyenleg csak a nap UTOLSÓ során jelenik meg; ezért is a fejléc H7='Sold' + H8='zi' (napi egyenleg).

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:344–360 — a `balance` minden tétel után frissül és reporting.ts:359 MINDEN soron ki is íródik (`<td class="text-right">${fmtNum(balance)}</td>`).

**Következmény:** A pénztárellenőr a napi záró egyenleget keresi (a kasszában lévő készpénzzel kell egyeznie); egy 8 tételes napon 8 különböző szám áll a „Sold zi” oszlopban, amiből nem derül ki, melyik a napi zárás.

#### 🟠 KÖZEPES — „Explicaţii”: a hivatalos Név + Megjegyzés + Román magyarázat, a Kartotékában csak partner + jogcím román neve

**Hivatalos:** 'Fo_konyv' F12='=TRIM(IF(M12<=$O$2,Q12&" "&R12&" "&S12,…))', ahol Q/R/S a Cs lap CJ='Név', CK='Megjegyzés', CL='Román magyarázat' oszlopa (Cs!CJ4='Név', CK4='Megjegyzés', CL4='Román magyarázat'). Ugyanez 'Naplo' E11 (R11/S11/T11 = CJ/CK/CL) és 'Kiadasi_kiseroiv' E8='=TRIM(IF(AND($M$1>=M8,$M$1>0),O8&" "&P8&" "&Q8,…))'.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:151–160 getDescription — `[name, cel?.nevro || cel?.nev].join(' — ')`; a tétel saját `megjegyzes` mezője NEM kerül a regiszterekbe (csak a csoportnaplóba, reporting.ts:893). Külön „román magyarázat” mező pedig nincs az adatmodellben (packages/ui-app/src/finance/types.ts:391–416: KiadasRow-ban csak `megjegyzes`).

**Következmény:** A román nyelvű regiszterben az egyedi magyarázat (pl. „reparație acoperiș casa parohială”) hiányzik; egy román ajkú ellenőr a jogcímnéven kívül nem lát semmit, a lelkész által beírt megjegyzés pedig sehol nem jelenik meg a hivatalos naplóban.

#### 🟠 KÖZEPES — Registrul-Jurnal: hiányzik a bankszámla-azonosító betű és a „Sold total (6+7)” sor

**Hivatalos:** 'Fo_konyv' D12='=IF($O$2>=M12,IF(O12=$O$9,"",UPPER(LEFT(O12,1))),"")' — a Fel és a Numar közötti, SZÁMOZATLAN oszlop (D10 üres, míg A10=1 B10=2 C10=3 E10=4 …), ami kassza esetén üres, banki tételnél a számla betűjele (A, B, C…). Az Adatok_2026.xlsx-ben 20 bankszámla-lap van (A…T), tehát 20 lehetséges betű. Záró blokk: U7='Sold total (6+7)' (F55/G55).

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:571–573 — csak `<th>Fel</th><th>Numar</th>`, számlabetű nincs; reporting.ts:576–580 a záró sorok: Report din luna precedenta / Total luna / Total rulaj / Sold numerar (6-8) / Sold banca (7-9) — a „Sold total (6+7)” sor hiányzik.

**Következmény:** Több bankszámlánál a főkönyvi sorból nem derül ki, MELYIK számla mozgásáról van szó (csak annyi, hogy „Bancă”), és hiányzik a készpénz+bank összevont záró egyenleg sora, ami a hivatalos űrlap utolsó egyeztető adata.

#### 🟠 KÖZEPES — Két hivatalos nyomtatvány, kétféle számformátum ugyanarra az évre

**Hivatalos:** A hivatalos munkafüzetek román területi beállítással készülnek (Kimutatasok_2026 / Resz_szamadas F-oszlop, Fo_konyv G–J oszlop) — egységes formátum minden nyomtatványon.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:112–116 fmtNum → SZÓKÖZ ezres + PONT tizedes („1 234.56”, a Registru Casa/Banca/Jurnal, csoportnapló és kísérőív mind ezt használja). packages/ui-app/src/finance/budget-reporting.ts:73–78 fmtNum → PONT ezres + VESSZŐ tizedes („1.234,56”, a költségvetés / számadás / részszámadás).

**Következmény:** Ugyanarra az évre két aláírt hivatalos papír megy be eltérő számformátummal; a „1 234.56” alak sem a román, sem a magyar konvenciónak nem felel meg, és félreolvasható (ezres vs. tizedes).

#### 🟠 KÖZEPES — Csoportnapló: hiányoznak a laponkénti Áthozat/Átvitel sorok, és a belső mozgások soha nem listázhatók

**Hivatalos:** 'Csoportnaplo' P1=50 (50 sor/lap); a lapzáró G60='=IF($Q$1>L59,$S$3,IF($Q$1=L59,$S$1,""))' ahol S3='Átvitel a következő lapra: ' és S1='Összesen: '; a következő lap nyitója G62 = S2='Áthozat az előző lapról: '; lábléc H61='=K61&". oldal"'. Az A3 legördülő forrása a `Koltvetnev` névtartomány (MINDEN költségvetési tétel, a készpénzletét/-felvétel is), az A2 pedig NÉV szerinti szűrés joker karakterekkel („? egy betű helyett…”); a Sugo.txt 220–223 példát is ad: „ha üresen hagyjuk a költségvetési tétel nevét, de a szűréshez beírjuk »Szabó«, listázni fog minden tételt…”.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:1017 `CSN_SOR_PER_LAP = 30` (50 helyett); a lapokon csak jogcím-részösszeg (`Total capitol — Jogcím összesen`, reporting.ts:971) és a záró blokk van, laponkénti áthozat/átvitel NINCS; a belső mozgásokat reporting.ts:841–842 `isInternal` (3xx/4xx/100) kihagyja, és apps/web/components/finance/finance-print-dialog.tsx:152–160 a jogcím-választóból is kiszűri őket; név szerinti szűrő nincs.

**Következmény:** A kassza↔bank belső mozgások (300.01/301.01/400.01/401.01/402.02) SEHOGY nem nyomtathatók csoportnaplóba, holott a hivatalos lapon választhatók; a laponkénti áthozat/átvitel hiányában a lefűzött ívek nem egyeztethetők egyenként; és nem lehet egy személy összes tételét kilistázni (a Sugo által javasolt „Szabó”-szűrés).

#### 🟠 KÖZEPES — Kiadási kísérőív: a „Minden kiadás (kassza + bank)” alapértelmezett forrás nem hivatalos, és összekeveri az iratgyűjtőket

**Hivatalos:** 'Kiadasi_kiseroiv' F1 legördülője az AN1:AN13 lista = 'Kassza', 'A - számla', 'B - számla', … — mindig EGY forrás; A6='=TRIM(T1&U1)' ki is írja a lapra a kiválasztott számlát. Sugo.txt 370–372: „külön-külön iratgyűjtőkbe lefűzni a kassza és a bankszámlák iratait”; 14_Egyhazi-adminisztracio…txt 884: „Külön-külön dossziéba gyűjtjük a készpénz mozgását, valamint a banki műveleteket dokumentáló iratokat.”

**Kartotéka ma:** apps/web/components/finance/kiseroiv-print-dialog.tsx:60 `useState<KiseroivSource>('mind')` — az ALAPÉRTELMEZETT forrás a „Minden kiadás (kassza + bank)” (211. sor), ami saját, harmadik sorszám-sorozatot is futtat (86–96).

**Következmény:** Az alapértelmezésen hagyott kísérőív egy lapon hozza a készpénzes és a banki kifizetést, így sem a kassza-, sem a bank-iratgyűjtőbe nem fűzhető le szabályosan — és a hozzá tartozó sorszám-sorozat a hivatalosban nem létezik.

#### 🟡 KISEBB — Kiadási kísérőív: hiányzik a beruházásnál kötelező leltári szám sor

**Hivatalos:** 'Kiadasi_kiseroiv' A29='=TRIM(IF(U7=1,"A(z) "&V29&". kiadási szám alatt vásárolt tárgy leltári száma: _________",IF(U7>1,"A(z) "&V29&". kiadási számok alatt vásárolt tárgyak leltári száma: "&W29,"")))'; a kiváltó feltétel L6='=Cs!CV51' → L7='=VLOOKUP(L6,Csfi,2,FALSE)' és soronként L8='=IF(D8=$L$7,1,0)', azaz ha a nap kiadásai közt beruházási jogcím van (vö. 'Resz_szamadas' E103=205.01, E104=205.02 „Investiţii / Beruházások”).

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:644–665 — a kísérőív HTML-je a táblázat és az aláírás-sáv között semmilyen leltári szám sort nem tartalmaz.

**Következmény:** A beruházásból vett tárgy bizonylatán nincs hova beírni a leltári számot, így a kiadás és a vagyonleltár közti kapcsolat a papíron megszakad.

#### 🟡 KISEBB — A kiadási kísérőív fejlécében a „Registrul-Jurnal” felirat, ami a hivatalos űrlapon nincs

**Hivatalos:** 'Kiadasi_kiseroiv' fejléce: A4='=TRIM(Cs!CK1&" "&Cs!CL1)' (egyházközség), A5='KIADÁSI KÍSÉRŐÍV', A6=a számla neve, E6=a kiadás-sorszám tartomány, F6='=YEAR(K2)&"."&K3&MONTH(K2)&"."&K4&DAY(K2)&"."'. „Registrul-Jurnal” felirat SEHOL nem szerepel rajta — az a 'Fo_konyv' lap címe (A6='REGISTRUL-JURNAL DE ÎNCASĂRI ŞI PLĂŢI').

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:648 `<div>Registrul-Jurnal</div>` a fejléc jobb oldalán (a súgó ezt szándékosnak írja: FinanceSugoTab.tsx:221, 648).

**Következmény:** A bizonylat egy MÁSIK hivatalos nyomtatvány nevét viseli; vizsgálaton összekeverhető a főkönyvvel.

#### 🟡 KISEBB — Kiadási kísérőív „Költségv. Tétel” oszlopa: hivatalosan a tétel SZÁMA, a Kartotékában a neve

**Hivatalos:** 'Kiadasi_kiseroiv' D8='=IF(AND($M$1>=M8,$M$1>0),VLOOKUP(R8,Csfi,2,FALSE),"")' — a Csfi 2. oszlopa a tétel SZÁMA (ezt igazolja 'Csoportnaplo' H7='="Költségvetési tétel száma: "&VLOOKUP(A3,Csfi,2,FALSE)'). A fejléc D7='Költségv.\nTétel'.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:623–627 — „a »Költségv. Tétel« oszlopban a jogcím MAGYAR + ROMÁN neve áll (a nyers kód nem) — a kód csak fallback” (F3, Q1/Q2 alapján tudatos döntés).

**Következmény:** Az ellenőr a költségvetési tétel SZÁMÁT keresi a bizonylaton (azzal egyeztet a számadással); a név hosszabb és nem hivatkozási alap. Legjobb megoldás: kód ÉS név egy cellában.

#### 🟡 KISEBB — Aláírás-blokk ott is, ahol a hivatalos űrlapon nincs

**Hivatalos:** A teljes Kimutatasok_2026.xlsx-ben aláírás-felirat CSAK két lapon van: 'Kiadasi_kiseroiv' A30='Lelkipásztor', E30='Főgondnok', A32='Ellenőrözte' (legördülőkkel: J30='Lelkipásztor', J31='Esperes'; K30='Gondnok', K31='Főgondnok', K32='Számvevő'), és 'Resz_szamadas' B123='Intocmit - Készítette', D123='Verificat - Ellenőrízte'. A 'Fo_konyv', 'Naplo' és 'Csoportnaplo' lapon NINCS aláírás-blokk.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:382–386 (Casa), 464–468 (Banca), 583–587 (Jurnal), 1028–1032 (Csoportnapló) — mindegyiken 3 aláíró: „Conducătorul unității — Lelkész/Gondnok”, „Întocmit — Készítette”, „Verificat — Ellenőrizte”.

**Következmény:** A bekötendő főkönyv MINDEN lapján aláírás-vonalak jelennek meg (a hivatalos főkönyv aláíratlan, folyamatos regiszter), és a helyfoglalás miatt kevesebb sor fér a lapra.

#### 🟡 KISEBB — A `buildFinancePrintDocument` a kísérőív típusra némán Registru Casát ad vissza

**Hivatalos:** A 'Kiadasi_kiseroiv' és a 'Naplo' két teljesen különböző nyomtatvány (más fejléc, más oszlopok, más aláírás-blokk).

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:1186–1190: `// A kiadási kísérőívet külön kell hívni (buildKiadasiKiseroiv)` — majd `if (type === 'kiadasi_kiseroiv') { return buildRegistruCasa(data, { ...filters, month: monthToUse }) }`.

**Következmény:** Ma nem sül el (mindkét dialógus kiszűri a típust), de bármelyik jövőbeli hívó némán rossz nyomtatványt kapna — hangos hiba helyett csendes csere.

#### 🟡 KISEBB — Éves módban a csak stornózott tételeket tartalmazó hónap üres lapot nyomtat

**Hivatalos:** 'Naplo' A3='=IF(N3=0,U6,…)' → U6='A kiválasztott napló a kiválasztott hónapban nincs felkönyvelve.' — a hivatalos lap kimondja, ha nincs adat.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:1213–1216 — a hónap „van-e adat” vizsgálata CSAK `!r.deleted`-et néz, a `stornozott`-at nem; a builderek viszont reporting.ts:268 szerint a stornózottakat kiszűrik.

**Következmény:** Az az év végi banknapló/kasszakönyv, ahol egy hónapban minden tétel stornózva lett, egy üres (csak áthozat + TOTAL LUNA 0) lapot ad, magyarázó szöveg nélkül.

#### ℹ️ INFÓ — Részszámadás: a hivatalos lap egy érték-oszlopos és borítólap nélküli

**Hivatalos:** 'Resz_szamadas' fejléc: B6='Denumire - Megnevezés', D6='Nr.\nSor-\nszám', E6='Capitol\nFejezet/\nalfejezet', F6='Executie\nSzámadás' — EGYETLEN érték-oszlop; a lap címe B5='=TRIM(Q8&Q1&Q2&Q3&Q4)' (Q1='Számadás ', Q4='. közötti időszakra'); a lezárás B123/D123 két aláíróval; borítólap NINCS.

**Kartotéka ma:** packages/ui-app/src/finance/budget-reporting.ts:492–503 (`buildCoverPage(... 'RÉSZSZÁMADÁS', 'SITUAȚIE FINANCIARĂ PARȚIALĂ' …)`) — borítólappal indul; budget-reporting.ts:632–637 `valueHeads` részszámadásnál KÉT érték-oszlopot ad („Prevederi anuale / ÉVES költségvetés” + „Execuție parțială / Időszaki teljesítés”); budget-reporting.ts:504 nyilatkozat-szöveg.

**Következmény:** Több információt ad, mint a hivatalos lap (és a `blocked` fail-closed kapu is helyes), de a kép nem azonos a hivatalossal — ha a lelkész „ugyanazt” várja, meglepetés éri. Tudatos bővítésnek tűnik, döntést igényel, nem javítást.

#### ℹ️ INFÓ — A kötelező nyomtatási rend sehol nincs kimondva a felületen

**Hivatalos:** Valtozasok_2026.txt 20–30. sor („Miket kell kinyomtatni?”): napi kasszakönyvi lap NEM, havi kasszakönyv IGEN (ezzel zárjuk a hónapot), kiadási kísérőív készpénzes ÉS banki kifizetés mellé, banki iratgyűjtőbe a HAVI extras (napi NEM), banknapló CSAK év végén Jan_Dec-cel, csoportnapló CSAK az év lezárása után, Főkönyv KÖTELEZŐ két oldalasan.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:47–101 FINANCE_PRINT_TYPES `description` mezői csak azt írják le, MI a nyomtatvány, azt nem, hogy MIKOR és MIT kell nyomtatni. A FinanceSugoChecklist.tsx:98 egyedül a havi kasszakönyvet említi.

**Következmény:** A lelkész a nyomtatási központból nem tudja meg, hogy a banknaplót csak év végén, a csoportnaplót csak zárás után, a főkönyvet viszont havonta kell nyomtatni — a papír-rend a fejében kell hogy legyen.

### Ami teljesen hiányzik

- A hivatalos xlsx LAPBEÁLLÍTÁSAI (álló/fekvő tájolás, margók, ismétlődő fejlécsor, nyomtatási terület, élőfej/élőláb) NINCSENEK benne a szöveges kivonatban — csak cellák és adatérvényesítések. Ezért a tájolás egyezését NEM tudtam ellenőrizni, csak az oszlopszámból következtetni (Kiadasi_kiseroiv A–F = 6 oszlop → álló; Fo_konyv A–K = 11, Naplo A–I = 9, Csoportnaplo A–H = 8). A Kartotéka: Casa/Banca/Jurnal/Csoportnapló FEKVŐ, kísérőív ÁLLÓ, részszámadás ÁLLÓ (reporting.ts:171, 213; budget-reporting.ts:94).
- A `Kisiv`, `Csfi`, `Koltvetnev`, `Kassza`, `NaploSz`, `KKNap`, `CSnaploSz`, `NregSZ` NÉVTARTOMÁNYOK az Adatok_2026.xlsx-ben élnek, és a kivonat nem tartalmazza a definiált neveket. Ezért NEM tudtam eldönteni, hogy a hivatalos kísérőívre CSAK bizonyos költségvetési tételek kerülnek-e (a Cs!BU7 képlet `VLOOKUP(CG7,Kisiv,2,FALSE)`-ra szűr), illetve hogy pontosan MELYIK jogcím (Csfi 894. sora, Cs!CZ51=894 → Cs!CV51) váltja ki a kísérőív leltári szám sorát.
- Nem futtattam SQL-t az éles adatbázison — a Kartotékához nincs Supabase MCP (a Baratosi Project NEM a Kartotéka DB). A mennyiségi állítások (hány hónap lép át 40 sort, hány nap 20 kiadást stb.) a mellékelt read-only SELECT-ekkel ellenőrizendők.
- Nem futtattam a webet/desktopot, tehát a nyomtatott PDF valódi lapra tördelését böngészőben NEM mértem. A lapozás hiánya és a beégetett `pg. 1` a kódból következik (reporting.ts:364–388, 446–470, 563–589, 644–665), nem mérésből.
- Az egyházmegyei/kerületi szint nyomtatványait (diocese_befizetes / diocese_kiadas / diocese_annual_reports) nem vizsgáltam — a feladat a gyülekezeti Kimutatasok_2026-ra szólt.
- A havi banki kivonat („extras”) nyomtatását a Valtozasok előírja a banki iratgyűjtőbe, de ez NEM a Kimutatasok munkafüzet terméke (a banktól jön), ezért nem is állítom, hogy a Kartotékából hiányzik. Ha a Kartotéka egyeztető „extras”-t akarna adni, az ÚJ nyomtatvány volna.

> **Megjegyzés:** Két apró, a Kimutatasok-területen kívüli megfigyelés, amit menet közben láttam és érdemes külön kezelni: (1) packages/ui-app/src/finance/reporting.ts:887 és 154 a `kedvezmenyzett || atvevo` sorrendet használja a kiadás partneréhez, holott a MEMORY szerint a `kiadas` táblában NINCS `kedvezmenyzett` oszlop (a típus téved) — ma véletlenül helyes eredményt ad (mindig az `atvevo`-ra esik vissza), de egy jövőbeli oszlop-hozzáadás némán átbillentené. (2) A gyülekezet neve a regisztereken `congregationNameRo || congregationName` (reporting.ts:366, 448, 565), a kísérőíven viszont csak a magyar `congregationName` (reporting.ts:646) — a hivatalos munkafüzetben mindkét helyen UGYANAZ az érték áll (Fo_konyv B5='=TRIM(Cs!CK1&" "&Cs!CL1)', Naplo A4='=Fo_konyv!B5', Kiadasi_kiseroiv A4 ugyanez), tehát ma a két Kartotéka-nyomtatvány más néven nevezi ugyanazt az egyházközséget. Végül: a 2026-os Adatok_2026.xlsx már 20 bankszámla-lapot tartalmaz (A…T), a korábbi 6/12 helyett — a Naplo AI1:AI21 legördülője is 'Kassza' + 20 számla; ezt a Registrul-Jurnal hiányzó számlabetű-oszlopa (10. eltérés) miatt érdemes fejben tartani.

---

## 8. Iktató és a 2024. január 1-től érvényes egyházközségi ügykörjegyzék

A hivatalos rendet két forrás írja elő. Az Igazgatótanács 66/2023. sz. határozata (14_Egyhazi-adminisztracio…txt, 3–5. oldal) az egyházközségi ügykörjegyzéket három részre bontja: A. Kötetes anyag (I–XII., alegységekkel), B. Szálas iratok (1–18., alegységekkel, F.Á./É.Á. megőrzési jelöléssel) és C. Elektronikus anyagok. Ugyanez a doc (11. oldal, „VII. Iktatókönyv”) rögzíti a 9 rovatot, és a 12. oldalon mintát ad az iktatópecsétre: „Ikt. sz: 36/2023 · I.gy: 1. Sorsz. 12”, kimenő iratnál „I. gy: 1/29.”. Az Iktato.xlsx ezt üzemelteti: az „Iktato” lap E2:Q2 fejlécei (E=Helyi iktató szám, F=Érkezés/küldés dátuma, G=Küldő iktató száma, H=Küldő keltezése, I=Cím Kitől/Kinek, J=Tárgykivonat, K=Iratgyűjtő legördülő, L=Lapok száma, M=Ha válasz, N=Megjegyzés, O=Hivatkozás címe, P=Iratgyűjtő száma, Q=Iratgyűjtői sor száma), az „Ugykorjegyzek_2024tol” lap pedig teljes egészében tartalmazza az A. és B. jegyzéket. A Kartotékában az ügykörjegyzék MEGVAN és a B. rész (18 főkategória + alegységek, F.Á./É.Á. besorolással) pontosan egyezik a 2024-es változattal: apps/web/lib/constants/filing-ugykorjegyzek.ts (30 tétel), az A. Kötetes anyag pedig teljes táblázatként a súgóban (apps/web/components/filing/iktato-help.tsx:575–597). Az adatlánc is végig él: varázsló → saveFilingEntry → iktato.ugykor_kod/retention_type (2026-05-28-iktato-erek-ugykorjegyzek-bovites.sql), és a 9-rovatos iktatókönyv-nyomtatás is megvan. A lelkész tehát a hivatalos rend szerint TUD iratot besorolni. A gond a peremeken van: az EREK-sablon importja az ügykört a legacy `file_folder` mezőbe teszi (és ott zárolja a rekordot), a mentés/offline/desktop ágak eldobják az ügykör-kódot, az iratgyűjtőn belüli sorszám („I.gy: 1/29”) és a Lapok száma nem létezik a felületen, és nincs a hivatalos Irattári leltár szerinti nyomtatvány.

### Eltérések

#### ⛔ BLOKKOLÓ — Az EREK-sablon importja az ügykört a legacy file_folder mezőbe teszi — az irat besorolatlan marad ÉS többé nem szerkeszthető

**Hivatalos:** Iktato.xlsx / 'Iktato' lap, K2='Iratgyűjtő' — data validation: type=list f1='Nevek' sqref=K3:K5000; a legördülő értékei az AD1:AD13 tartomány ('Levelezés', 'Anya- és családkönyvi levelezés', 'Jelentések', …). Ez a rovat AZ irattári szám forrása (a P oszlop VLOOKUP-pal ebből képzi az iratgyűjtő számát).

**Kartotéka ma:** apps/web/lib/import/import-profiles.ts:977 — { excelHeader: 'Iratgyujto', excelAliases: ['Iratgyűjtő', …], dbColumn: 'file_folder' }. A file_folder a LEGACY 3-értékű mező (apps/web/lib/constants/filing.ts:19 FILING_FOLDERS = ['F.Á.','É.Á.','A.K.']), az ugykor_kod-ra NINCS oszlop-map. A DB-ben a file_folder CHECK nélküli text (migration-docs/Database_schema.sql:784), így némán felveszi a 'Levelezés' szöveget.

**Következmény:** Az importált iratoknak ugykor_kod = NULL, azaz nincs irattári számuk: a 9-rovatos iktatókönyv 8. rovata és az iktatópecsét I.gy sora üresen („—”) nyomtat. Ráadásul a rekord ZÁROLÓDIK: a szerkesztéskor a UI a file_folder='Levelezés' értéket változatlanul visszaküldi (filing-main.tsx:328 és :544 — a file_folder-re NINCS beviteli elem a felületen), a zod pedig z.enum(FILING_FOLDERS)-szel elutasítja (apps/web/lib/validations/filing.ts:11) → a saveFilingEntry hibát ad, a lelkész az importált iratot soha nem tudja se javítani, se besorolni.

#### 🔴 SÚLYOS — Az import a küldő iktatószámát és keltét rossz mezőbe teszi, a beérkezés idejét és a mellékletszámot pedig egyáltalán nem hozza

**Hivatalos:** Iktato.xlsx / 'Iktato' lap: G2='Küldő iktató száma', H2='Küldő keltezése', O2='Hivatkozás címe'. A 14_Egyhazi-adminisztracio…txt 11. oldal: „A második rovatba a beérkezett irat hivatalos számát és keltét jegyezzük fel. A harmadik rovatba … az irat beérkezési idejét … A negyedik rovatba a mellékletek számát … A kilences rovatba beírjuk a válaszlevélre általunk felírt iktatószámot: »lásd….«”

**Kartotéka ma:** apps/web/lib/import/import-profiles.ts:979 'Kuldo iktato szama' → dbColumn 'irattarijel' (nem external_ref_szam); :976 'Kuldo keltezese' → '_kuldo_keltezese' virtuális mező, amit a batch-import-actions.ts:326 a megjegyzés szövegébe fűz (nem external_ref_kelt); :983 'Hivatkozas cime' → '_hivatkozas', szintén a megjegyzésbe (batch-import-actions.ts:327), nem valasz_iktatoszam. A 'beerkezes_ideje' és 'mellekletek_szama' oszlopokra NINCS map.

**Következmény:** A 2026-05-28-as migrációval létrehozott, hivatalosan előírt rovatok (2., 3., 4., 9.) importált iratoknál üresek maradnak, az adatok pedig szabadszöveggé válnak a megjegyzésben — kereshetetlenül. A külső iktatószám az `irattarijel` (irattári jel) mezőbe kerül, ami szemantikailag MÁS: az az I.gy jelölés helye. Egy régi iktatókönyv áttöltése után a Kartotéka-nyomtatvány nem azonos a papíralapú/Excel iktatókönyvvel.

#### 🔴 SÚLYOS — Nincs iratgyűjtőn belüli sorszám („I.gy: 1/29”), és az iktatópecsét Sorsz rovatába az iktatószám kerül

**Hivatalos:** 14_Egyhazi-adminisztracio…txt, 12. oldal, Iratkezelési példák — beérkező irat pecsétje: „Iktatva / Kelt: 2023. május 3. / Ikt. sz: 36/2023 / I.gy: 1.   Sorsz. 12 / Elintézve: ___”; kimenő irat: „I. gy: 1/29.”. Az Iktato.xlsx ezt automatizálja: P3='=…VLOOKUP(K3,$AD$1:$AK$15,5,FALSE)' (iratgyűjtő száma) és Q3='=…COUNTIF($T$3:T3,T3)' (iratgyűjtői sor száma), a Nyomtathato_iktato lap F10='Irattári jele' pedig F11='=TRIM(…M11&$M$10&N11…)' képlettel a kettőt „ / ” jellel fűzi össze.

**Kartotéka ma:** apps/web/components/filing/iktato-print.tsx:99 — `<div>I.gy: ${entry.ugykor_kod || '—'}</div>`, majd :100 — `<div>Sorsz: ${entry.sequence_number}</div>`. A 9-rovatos iktatókönyv 8. rovata is csak a kódot írja (:133). Az `iktato` táblán nincs iratgyűjtőn belüli sorszám-oszlop, és nincs olyan számláló sem (a migration-docs/sql/2026-05-17-iktato-sequence-pointer-rpc.sql csak (congregation_id, year) szintű pointert vezet).

**Következmény:** A pecsét „Sorsz” rovatában az iktatószám ismétlődik meg (36/2023 → Sorsz: 36) a mintában előírt iratgyűjtői sorszám (12) helyett — vagyis a Kartotékával lepecsételt irat NEM a hivatalos minta szerinti. Az irattári jel (1/29) így csak kézzel, az `irattarijel` szabadszöveges mezőbe írható, ami a lelkésznek fejben tartott számolást jelent minden iratnál.

#### 🔴 SÚLYOS — Az offline mentés, az Excel-mentés és a desktop ELDOBJA az ügykör-kódot és a többi EREK-rovatot

**Hivatalos:** 14_Egyhazi-adminisztracio…txt, 11. oldal: „A nyolcadik rovatba az ügykörjegyzékben megjelölt irattári számot jegyezzük be a lehető legpontosabban.” Az ügykörjegyzék C. része (5. oldal): „Mentsük a lehető legidőtállóbb hordozóra, több helyre, időszakonként ellenőrizzük.”

**Kartotéka ma:** apps/web/lib/offline/table-registry.ts:389–397 — a select-lista SZÁNDÉKOSAN kihagyja: 'external_ref_*', 'beerkezes_ideje', 'mellekletek_szama', 'valasz_iktatoszam', 'ugykor_kod', 'retention_type', 'has_duplicate'. apps/web/lib/offline/excel-schema/registry.ts:374–387 — az 'Iratok' munkalap mezőlistájában sincs Ügykör oszlop. apps/desktop/src/lib/sync.ts:4334 és :4426 — az iktato_local INSERT oszloplistája ugyanígy megáll a legacy mezőknél.

**Következmény:** A napi mentésből / Excel-mentésből visszaállított iktatókönyvben MINDEN irat besorolatlan lesz (ugykor_kod = NULL) — pont az a rovat vész el, amit a szabályzat 8. rovatként kötelezően előír. A desktopon dolgozó lelkész az ügykört egyáltalán nem látja.

#### 🟠 KÖZEPES — A „Lapok száma” a felületen nem rögzíthető, pedig az oszlop létezik és az Irattári leltár ebből számol

**Hivatalos:** Iktato.xlsx / 'Iktato' lap, L2='Lapok\nszáma', data validation: type=whole f1='0' sqref=L3:L5000. Az 'Irattari_leltar' lap ebből képzi a halmozott lapszám-tartományt: L11='=SUMIF(Iktato!$S$3:$S$10000,H11,Iktato!$V$3:$V$10000)', J11='=IF(L11<>0,IF(K11<>K10+1,K10+1&"-"&K11,K11),J10)' — az F10='Lap szám' oszlop ebből lesz.

**Kartotéka ma:** Az `iktato.oldalszam integer` oszlop LÉTEZIK (migration-docs/Database_schema.sql:791), a desktop és az import ismeri is (sync.ts:4263, import-profiles.ts:978), a web viszont nem: az `oldalszam` NINCS benne a FilingEntry interfészben (apps/web/lib/constants/filing.ts:28–62), a zod sémában (apps/web/lib/validations/filing.ts) és a saveFilingEntry record-objektumában (apps/web/app/(dashboard)/iktato/actions.ts:183–200) sem.

**Következmény:** A lelkész a weben nem tudja megadni az irat lapszámát, így az irattári leltár lapszám-oszlopa sosem lesz kitölthető, és az iratgyűjtő lezárásakor előírt lapszámozás/átfűzés nem támogatott. (Meglévő érték nem vész el: a szerkesztés parciális UPDATE, az `oldalszam` mezőt nem írja felül.)

#### 🟠 KÖZEPES — Nincs a hivatalos Irattári leltár szerinti nyomtatvány — az iratcsomó-leltár nem ugyanaz

**Hivatalos:** Iktato.xlsx / 'Irattari_leltar' lap: G1=év (data validation whole ≥2024), G2=iratgyűjtő neve a 'Nevek' legördülőből, A8='=I8&I1&J8' → „<iratgyűjtő szám> <év>. számú iratgyűjtő”, fejléc A10='S.\nsz.', B10='Ikt.\nsz.', C10='Dátum', D10='Küldő\nCimzett', E10='Tárgy', F10='Lap\nszám'. A 14_Egyhazi-adminisztracio…txt „1. Levelezés” szakasza: „Év végén iktatószámok sorrendje szerint sorba rakjuk, iratjegyzéket készítünk, átfűzzük, hitelesítjük.”

**Kartotéka ma:** apps/web/components/filing/iratcsomo-panel.tsx:877–883 — LELTAR_TABLE_HEAD oszlopai: Iktatószám | Kelt | Tárgy | Irány | Ügykör. Nincs sem folyó S.sz., sem Lapszám oszlop. A csomó-entitás (migration-docs/sql/2026-07-17-f6-iktato-csomok-csatolmanyok.sql:47, `public.iratcsomo`: id, congregation_id, ev, nev, leiras, lezarva) NEM ügykörhöz kötött — szabadon nevezett éves doboz; az ügykör szerinti bontás csak opcionális csoportosítás a nyomtatásban (iratcsomo-panel.tsx:906–922).

**Következmény:** A lelkész nem tud iratgyűjtőnként+évenként a hivatalos formátumú, lapszámozott irattári leltárt nyomtatni az iratgyűjtő lezárásához. Az iratcsomó-leltár közel áll hozzá, de két kötelező oszlopa (S.sz., Lapszám) hiányzik, és a csomó nem az ügykörjegyzék szerinti dosszié.

#### 🟠 KÖZEPES — A válaszirat nem kaphatja meg ugyanazt az iktatószámot — a partial UNIQUE index megakadályozza

**Hivatalos:** 14_Egyhazi-adminisztracio…txt, 11. oldal: „Fontos, hogy a válaszirat ugyanazt az iktatószámot kapja, mint a megkeresés, és együtt kerülnek irattárba.” Az Iktato.xlsx ezt külön sorral oldja meg: M2='Ha\nválasz' (data validation list, f1='$AI$1', AI1='Válasz'), a sorszám-képlet D4='=IF(F4<>0,IF(YEAR(F4)<>YEAR(F3),1,IF(M4=$AI$1,D3,D3+1)),"")' — vagyis „Válasz” esetén NEM lép a szám. A 'Szinek' lap B5 ezt is kimondja: „Világoskék sor: válaszlevél, az előző sorral azonos iktatószámmal”.

**Kartotéka ma:** migration-docs/sql/2026-05-17-iktato-sequence-pointer-rpc.sql:152–154 — CREATE UNIQUE INDEX iktato_unique_active_cong_year_seq ON public.iktato (congregation_id, year, sequence_number) WHERE deleted = false. A kódban nincs „ha válasz” jelölő; a válasz csak ugyanazon a soron, az elintezes_ideje / elintezes_modja mezőkkel kezelhető, vagy a valasz_iktatoszam szabadszöveges kereszthivatkozással (filing-main.tsx:1217–1222 — „pl. »lásd 36/2023«”).

**Következmény:** Ha a lelkész a hivatalos Excel logikáját követve a válaszlevelet külön (kimenő irányú) tételként akarja felvenni ugyanazzal az iktatószámmal, a mentés 23505-ös hibával elutasítja („A 2026/36 iktatószám már foglalt”). A kimenő válasz iránya és kelte így nem rögzíthető külön. A papíralapú könyv logikájának (egy szám, alsó sor = válasz) megfelel, az Excel-nyomtatvánnyal viszont nem egyezik.

#### 🟠 KÖZEPES — Az ügykör (irattári szám) megadása sehol nem kötelező — besorolatlan iratok keletkezhetnek

**Hivatalos:** 14_Egyhazi-adminisztracio…txt, 11. oldal: „A nyolcadik rovatba az ügykörjegyzékben megjelölt irattári számot jegyezzük be a lehető legpontosabban.” Az Iktato.xlsx-ben a K oszlop kitöltése nélkül a P/Q képletek #N/A-t adnak, tehát az irat nem sorolható be.

**Kartotéka ma:** apps/web/components/filing/filing-main.tsx:427–440 (goNextStep) — az 1. lépésről csak a `kelt` és a `subject` kötelező; az ügykör a 2. lépésen van, és a handleSave (:518–530) sem ellenőrzi. A zod sémában `ugykor_kod: z.string().nullable().optional()` (apps/web/lib/validations/filing.ts:24), a DB-ben `ugykor_kod text` NOT NULL nélkül. A validateHivataliUt (filing-ugykorjegyzek.ts:61–67) ad ugyan warning-ot üres ügykörnél, de a handleSave nem nézi meg a `hivataliUtWarnings` tömböt. A gyorsrögzítő sorban is opcionális (filing-quick-row.tsx:97).

**Következmény:** Egy gyorsan iktatott irat ügykör nélkül marad, és semmi nem figyelmezteti a lelkészt később. Ezek az iratok az iktatókönyv 8. rovatában „—”-ként nyomtatnak, és a fizikai iratgyűjtőbe nem sorolhatók be — pont a szabályzat által előírt legfontosabb rendezőelv hiányzik róluk.

#### 🟠 KÖZEPES — A desktop iktató read-only és nem ismeri az ügykörjegyzéket

**Hivatalos:** 14_Egyhazi-adminisztracio…txt, 11. oldal: „Az iktatókönyv elektronikus formában is vezethető.” — az iktatás a lelkészi hivatal alapművelete, nem csak megtekintés.

**Kartotéka ma:** apps/desktop/src/pages/iktato-page.tsx:1–17 fejlécdoksi: „Sprint G (2026-04-25) — READ-ONLY desktop-paritás… »Új irat« gomb (disabled, hamarosan). Új irat rögzítése (write-flow) Sprint H+-ra kerül.” A teljes apps/desktop forrásban nincs egyetlen „ügykör”/„ugykor” találat sem.

**Következmény:** Offline (internet nélküli parókián) a lelkész nem tud iktatni, és a szinkronizált iratlistán az ügykör-besorolást sem látja — a desktopon az irattári rend gyakorlatilag nem létezik.

#### 🟡 KISEBB — Az iktatókönyv-nyomtatvány mindig kiírja a „Lezárva december 31-én” záradékot, akkor is, ha az év nyitott

**Hivatalos:** 14_Egyhazi-adminisztracio…txt, 11. oldal: „Az iktatókönyvet minden év december 31-én lezárjuk. A lezárásnál az oldalon üresen maradt sorokat, az utolsó, legalsó sor kivételével, áthúzzuk. Az utolsó sorba beírjuk: Lezárva 202_. december 31-én. Aláírja lelkipásztor és főgondnok…”

**Kartotéka ma:** apps/web/components/filing/iktato-print.tsx:163 — `<p class="closing">Lezárva ${opts.year}. december 31-én.</p>` — feltétel nélkül, függetlenül attól, hogy az `iktato_yearly_closures` táblában van-e sor az adott évre (a lezárás-logika egyébként megvan: actions.ts:346 closeFilingYear).

**Következmény:** Egy év közben (pl. augusztusban) kinyomtatott munkapéldány már lezárási záradékot és aláírás-helyeket visel — ez ellenőrzéskor félrevezető, mintha a könyv le lenne zárva. Az üresen maradt sorok áthúzása szintén nem támogatott.

#### ℹ️ INFÓ — Az iktatásra felkínált ügykörök köre tágabb, mint a hivatalos Excel legördülője

**Hivatalos:** Iktato.xlsx / 'Ugykorjegyzek_2024tol' lap, G1 megjegyzés: „Ebben az oszlopban található ügykörhöz tartozó iratokat iktatjuk, ezek a ügyköri megnevezések érhetőek el a lenyílóban. A többi iratot iktató szám nélkül fűzzük le a megfelelő iratgyűjtőbe.” A legördülő (Iktato!AD1:AD13) 13 tételt tartalmaz: 1., 2., 3., 4., 6/1., 6/4., 8., 13/1., 13/2., 13/3., 14., 15., 17.

**Kartotéka ma:** apps/web/lib/constants/filing-ugykorjegyzek.ts:102–328 — mind a 30 ügykör (18 fő + 12 alegység) választható; a varázsló kereshető rádiólistája (filing-main.tsx:1120–1170) az egész FILING_UGYKOROK tömböt kínálja.

**Következmény:** A két hivatalos forrás itt egymásnak feszül: a 14. sz. szabályzat 11. oldala szerint „minden iratot, okmányt… iktatunk”, az Excel viszont 13 ügykörre szűkíti az iktatandók körét. A Kartotéka a tágabb (szabályzat szerinti) értelmezést követi — ez védhető, de aki párhuzamosan az EREK-Excelt is vezeti, eltérő iktatószám-sorozatot kap. Érdemes a súgóban jelölni a 13 „legördülős” ügykört.

#### ℹ️ INFÓ — A hivatalos Excel ügykörjegyzék-lapja maga is tartalmaz elírásokat — a Kartotéka a PDF-et követi (helyesen)

**Hivatalos:** Iktato.xlsx / 'Iktato' lap AG6='6/2 - ' de AH6='6/4.' ugyanarra az „Ingatlanadók, felértékelések…” ügykörre (a PDF 4. oldala szerint 6/4. a helyes). Továbbá 'Ugykorjegyzek_2024tol' B7=4, D7='Választók névjegyzéke' (a PDF: „Választói névjegyzékek”), C26='13 1.' / C27='13 2.' / C28='13 3.' perjel helyett szóközzel, és az xlsx-lapról hiányzik a PDF „Régi szám” oszlopa.

**Kartotéka ma:** apps/web/lib/constants/filing-ugykorjegyzek.ts:176 kod '6/4.', :132 nev 'Választói névjegyzékek', :271/:277/:283 kod '13/1.'/'13/2.'/'13/3.' — mind a PDF (IT 66/2023) szerinti. A „Régi szám” megvan a súgó-táblázatban (iktato-help.tsx:775–809 `regi` mező), de nincs benne a FILING_UGYKOROK adatszerkezetben.

**Következmény:** Nincs teendő a besoroláson: a Kartotéka a mérvadó határozatszöveget követi. Következmény viszont, hogy az „Ingatlanadók…” ügykörnél az EREK-Excel „6/2 - … számú iratgyűjtő” fejlécet nyomtat, a Kartotéka „6/4.”-et — ellenőrzéskor ezt érdemes tudni. A régi ügyköri számok adatban való tárolása segítené a 2024 előtti iratok visszakeresését.

### Ami teljesen hiányzik

- A. Kötetes anyag (I–XII.) mint ADATSZERKEZET: csak súgó-szövegként létezik (apps/web/components/filing/iktato-help.tsx:575–597), nincs mögötte nyilvántartás. Konkrétan hiányzik: V. Be- és kiköltözöttek nyilvántartása, VIII. Aranykönyv, IX. Historia Domus, XII. Belmissziós szövetségek (XII/1. Nőszövetség, XII/2. IKE, XII/3. Dalárdák) mint kezelhető kötet.
- C. Elektronikus anyagok kategória (ügykörjegyzék 5. oldal): nincs sem kód, sem nyilvántartás az elektronikus jegyzőkönyvekre, videó/audió anyagokra.
- Iratgyűjtő-dosszié entitás ügykörönként ÉS évenként: a public.iratcsomo (ev, nev, lezarva) szabad nevű doboz, nincs ugykor_kod oszlopa, nincs benne megőrzési típus (F.Á./É.Á.) sem, tehát az É.Á. dossziék évvégi automatikus lezárása nem támogatott.
- Iratgyűjtőn belüli folyó sorszám (Iktato.xlsx Q oszlop) és az ebből képzett „Irattári jele” (P/Q, pl. „1 / 29”) — se oszlop, se számláló, se nyomtatás.
- „Lapok száma” beviteli mező a web-felületen (az iktato.oldalszam oszlop létezik, de a FilingEntry/zod/saveFilingEntry nem ismeri).
- Hivatalos Irattári leltár nyomtatvány (Irattari_leltar lap: iratgyűjtő + év fejléc, S.sz. / Ikt.sz. / Dátum / Küldő-Címzett / Tárgy / Lapszám, halmozott lapszám-tartománnyal).
- „Ha válasz” jelölő és a válaszlevél azonos iktatószámmal történő külön rögzítése (Iktato.xlsx M oszlop + Szinek lap B5).
- Az évvégi lezárás nyomtatási része: az üresen maradt sorok áthúzása, és a záradék feltételhez kötése (ma mindig kiíródik).
- 5 évenkénti bekötés és a gyülekezet átadása előtti kötelező bekötés nyilvántartása (14_Egyhazi-adminisztracio…txt 11. oldal) — nincs se rekord, se emlékeztető.
- Az ügykörjegyzék „Régi szám” oszlopa adatként (FILING_UGYKOROK-ban) — a 2024 előtti iratok visszakereséséhez; ma csak a súgó-táblázatban van.
- Import-oszlopok az EREK-sablon 2–4. és 8–9. rovatához (ugykor_kod, beerkezes_ideje, mellekletek_szama, external_ref_szam, external_ref_kelt, valasz_iktatoszam).
- Desktop iktató write-flow és ügykör-megjelenítés.

> **Megjegyzés:** A fő kérdésre a válasz: IGEN, az ügykörjegyzék megvan a rendszerben, és a B. Szálas iratok rész tételről tételre EGYEZIK a 2024. január 1-től érvényes változattal (Igazgatótanács 66/2023.) — kód, megnevezés és F.Á./É.Á. megőrzési típus szinten is; az A. Kötetes anyag pedig teljes táblázatként megvan a súgóban. A lelkész tehát tud a hivatalos rend szerint besorolni. A HIVATALOS ÜGYKÖRJEGYZÉK FŐKATEGÓRIÁI TELJESEN — A. Kötetes anyag: I. Presbiteri gyűlések jegyzőkönyvei; II. Közgyűlési jegyzőkönyvek; III. Anyakönyvek (III/1. Keresztelési, III/2. Konfirmálási, III/3. Esketési, III/4. Temetési, III/5. Át- és kitértek anyakönyve); IV. Családkönyv és az elektronikus nyilvántartás nyomtatott és bekötött lapjai; V. Be- és kiköltözöttek nyilvántartása; VI. Lelkipásztori munkanapló; VII. Iktatókönyv; VIII. Aranykönyv; IX. Historia Domus; X. Leltárak (Registrul numerelor de inventar); XI. Főkönyv (Registru jurnal); XII. Belmissziós szövetségek jegyző- vagy emlékkönyvei (XII/1. Nőszövetség, XII/2. IKE, XII/3. Dalárdák, dalkörök, zenekarok). B. Szálas iratok: 1. Levelezés (egyházkerületi, egyházmegyei, egyházközségi, világi hatóságokkal, magánszemélyekkel) — É.Á.; 2. Anya- és családkönyvi levelezés és adatvédelmi nyilatkozatok — F.Á.; 3. Jelentések — F.Á.; 4. Választói névjegyzékek — F.Á.; 5. Egyházi alkalmazottak személyi iratgyűjtői — F.Á.; 6. Leltári ügyek (6/1. Vagyonleltári jelentések, leltárívek, selejtezési jegyzőkönyvek — É.Á.; 6/2. Birtokívek, birtoklevelek, telekkönyvi kivonatok, adóazonosító-kivonat „cod fiscal”, gépkocsik törzskönyve; 6/3. Alapeszközök nyilvántartó lapjai; 6/4. Ingatlanadók, felértékelések, kockázatfelmérések, biztosítások; 6/5. Részvények és banki kötvények; 6/6. Pecsétnyomók nyilvántartása; 6/7. Anyagraktári ügyek — mind F.Á.); 7. Műemlékek, műkincsek, történeti értékű tárgyak — F.Á.; 8. Költségvetések, költségvetés-módosítások, számadások — F.Á.; 9. Pénzügyi igazoló iratok — É.Á. (9/1. Pénztári igazoló iratok — készpénz; 9/2. Banki igazoló iratok); 10. Csoportnapló — É.Á.; 11. Fizetési jegyzékek — F.Á.; 12. Munkavédelem, tűzvédelem — F.Á.; 13. Szerződések — F.Á. (13/1. Bérleti, 13/2. Közüzemi, 13/3. Szolgáltatási és támogatási); 14. Pályázatok — F.Á.; 15. Ellenőrzési jegyzőkönyvek (belső, gazdasági bizottsági és felsőbb hatósági) — F.Á.; 16. Egyházközségi egyesületek és alapítványok (statútum, hivatalos adatok, bírósági kivonatok) — F.Á.; 17. Temetőügyek — F.Á.; 18. Gyülekezeti kiadványok, aprónyomtatványok, rendezvények dokumentumai — F.Á. C. Elektronikus anyagok (jegyzőkönyvek, könyvelés, leltár, munkanapló, gyülekezeti nyilvántartás, videó/audió). AMIT ELLENŐRIZTEM, A TELJES ADATLÁNC: UI (apps/web/components/filing/filing-main.tsx, filing-quick-row.tsx, certificate-issue-dialog.tsx, iratcsomo-panel.tsx, iktato-print.tsx, iktato-help.tsx) → server action (apps/web/app/(dashboard)/iktato/actions.ts) → validáció (apps/web/lib/validations/filing.ts) → konstansok (apps/web/lib/constants/filing.ts, filing-ugykorjegyzek.ts) → tábla/RPC (migration-docs/Database_schema.sql:776, migration-docs/sql/2026-05-28-iktato-erek-ugykorjegyzek-bovites.sql, 2026-05-17-iktato-sequence-pointer-rpc.sql, 2026-05-29-iktato-fazis-3-workflow.sql, 2026-07-17-f6-iktato-csomok-csatolmanyok.sql) → RLS (iktato_access policy, 2026-07-17-f6…sql:441, profile_roles-lábbal — rendben van). Az RLS-t és az iktatószám-kiosztást (atomic SECURITY DEFINER RPC + partial unique index) rendben találtam. NEM MÓDOSÍTOTTAM SEMMIT — ez kizárólag állapotfelmérés. Két állítást SZÁNDÉKOSAN nem tettem ténnyé, mert csak élő adaton dönthető el: (a) van-e ténylegesen importált, file_folder-rel zárolt irat (SQL #4), (b) van-e elcsúszott sorszám-számláló (SQL #7). A 2026-os változások (Valtozasok_2026.txt) közül az A/B gyülekezet-változat és a készpénz-szabályok az iktatót közvetlenül nem érintik; az új, 2026-tól kötelező lelkészi jelentés (IT 65/2025) viszont a 3-as ügykörbe (Jelentések, F.Á., másodpéldány kötelező) tartozik — ezt a rendszer helyesen jelöli (filing-ugykorjegyzek.ts:120–127: routeDirection 'outgoing', duplicateRequired true).

---

## 9. Főkönyv (Registru Jurnal) — a kötelező, bekötendő nyomtatvány: hivatalos EREK 2026 ív ⇄ Kartoteka `buildRegistruJurnal`

A hivatalos ív a `Kimutatasok_2026.xlsx` „Fo_konyv" munkalapja (A6='REGISTRUL-JURNAL DE ÎNCASĂRI ŞI PLĂŢI'), 10 számozott oszloppal: 1 Nr.crt., 2 Data înreg., 3 Document/Fel, 4 Numar, 5 Explicaţii, 6 Încasări-Numerar, 7 Încasări-Bancă, 8 Plăți-Numerar, 9 Plăți-Bancă, 10 Simb.cont. (R8–R10 fejlécsorok). Egy NYOMTATOTT LAP fix 45 sor: 11. sor = átvitel („Report din luna precedentă" az első lapon, „Report pagina precedentă" a többin), 12–51. sor = 40 tétel (M3=40), 52. sor = lapzáró „De reportat pagina:", majd a hónap utolsó lapján még három sor: „Total luna", „Total rulaj", „Sold numerar(6-8) / Sold bancă (7-9)" és „Sold total (6+7)"; a lapszám a K oszlopban: K55='="pg. "&N55', N55='=SUM(O5,O6)' — azaz a hónapon belüli lapszám + az előző hónapok lapszáma, tehát ÉVEN BELÜL FOLYTATÓLAGOS. A nyitó egyenleg kérdésében a hivatalos ív egyértelmű: G11='=ROUND(SUM(Q5:Q6),2)', ahol Q6='=SUM(Cs!CQ1)', Cs!CQ1='=INDEX(Kassza,1,6)' = az Adatok Kassza lap 6. sora („Előző évi készpénzegyenleg:") a 6. oszlopban, ami a „Bev. - Összeg" — tehát a nyitó a HIVATALOS íven IS a 6./7. (Încasări) forgalmi oszlopba kerül a Report soron belül, külön „sold initial" oszlop nincs, az egyenleg 6−8 és 7−9 különbségként áll elő. A Kartoteka `packages/ui-app/src/finance/reporting.ts` `buildRegistruJurnal` (484–597. sor) ezt a nyitó-kezelést PONTOSAN eltalálja (576., 579., 559–560. sor), tehát a korábbi felmérés „a nyitó a forgalmi oszlopba kerül" megállapítása igaz, de NEM hiba. Ami viszont hiányzik: a 40 soros lapokra tördelés, a lapátviteli sorok, a folytatólagos lapszámozás (a `pg. 1` bedrótozott, 588. sor), a „Sold total (6+7)" záró sor, a 10. „Simb. cont." oszlop, valamint a Document/Fel oszlop rossz értéket ír, mert a `getDocType()` (129–133. sor) az `irattipus === 'Banki'` pontos szövegegyezésre épül, miközben ugyanabban a függvényben a kassza/bank szétválasztás már helyesen `bankszamla_id` alapú. Kétoldalas (față-verso) nyomtatás és kötésmargó semmilyen formában nincs támogatva (@page margin: 0 + egységes 10 mm padding, 171. és 174. sor). Ugyanez a builder fut a weben és a desktopon is (`apps/web/components/finance/finance-print-dialog.tsx:361`, `apps/desktop/src/components/finance-print-dialog.tsx:343`), tehát minden eltérés mindkét felületet érinti.

### Eltérések

#### ⛔ BLOKKOLÓ — Nincs 40 soros lapokra tördelés — a bekötendő Főkönyv egyetlen, végtelen táblázat

**Hivatalos:** Kimutatasok_2026.txt, 'Fo_konyv' lap: M3=40 (sor/lap), O4='=ROUNDUP(O3/M3,0)' („Össz lap"). Egy laptömb = 45 sor: R11 = átvitel-sor, R12–R51 = 40 tétel, R52 F='=IF(M51<$O$2,$U$4,...)' → U4='De reportat pagina:' (lapzáró átvitel), R56 F='=IF(M56<$O$2,$U$6,"")' → U6='Report pagina precedentă: ' (a KÖVETKEZŐ lap nyitó sora), R57-től a következő 40 tétel.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:563–589 — egyetlen `<div class="page">`, a hónap ÖSSZES tétele egy `<table>`-ben (`${tbody}`, 577. sor); sem darabolás, sem lapzáró/lapnyitó sor nincs. A fájlban a csoportnapló már oldalakra bont (1152–1157. sor), a Registrul-Jurnal nem.

**Következmény:** 40-nél több havi tétel esetén a böngésző önkényes helyen tördel, átvitel-sor nélkül. Egy kinyomtatott lap önmagában nem ellenőrizhető (nem látszik, mi jött át az előző lapról), így a lefűzött és később keményfedelesbe kötött Főkönyv nem felel meg a hivatalos ívnek. Pénzügyi vizsgálatnál (Penzugyi_vizsgalat.txt: „Naplóregiszter (Registru jurnal) kinyomtatva és lefűzve") ez kifogásolható.

#### 🔴 SÚLYOS — Bedrótozott „pg. 1" lapszám — nincs folytatólagos lapszámozás

**Hivatalos:** 'Fo_konyv' K55='="pg. "&N55'; N55='=SUM(O5,O6)', ahol O5 = a hónapon belüli lap sorszáma („jel lap"), O6='=VLOOKUP(M1,X1:AG12,10,FALSE)' = az AG oszlop = '=SUM($AF$1:AF{m})' = az ELŐZŐ hónapok lapszámának összege (AF{m}='=ROUNDUP(AE{m}/$M$3,0)'). A következő laptömb: N100='=IF(M57<=$O$2,SUM(N55,1),"")'. Tehát a lapszám az éven belül folytatólagos.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:588 — `<div class="page-num">pg. 1</div>` fixen. Az éves módban (1224. sor) csak a `pg. 1` → `pg. {pageNum}` csere fut, ahol `pageNum` a HÓNAPOK sorszáma (1210–1227), nem a lapoké.

**Következmény:** A nem selejtezhető, keményfedelesbe kötendő Főkönyv minden havi lapja „pg. 1"-et visel. Nincs az a lapszámlálás, amire a Sugo.txt:373–374 és a Valtozasok_2026.txt előírása épül („öt évenként vagy 200 lap terjedelmet követően kemény laptáblába beköttetjük") — a lelkész nem tudja megmondani, hány lapnál tart.

#### 🔴 SÚLYOS — A „Document / Fel" oszlop minden banki tételre „Chit."-et ír

**Hivatalos:** 'Fo_konyv' C12='=IF($O$2>=M12,VLOOKUP(M12,Cs!$CB$7:$CN$33000,12,FALSE),"")' → Cs!CM = '=INDEX(Kassza,sor,4)'; az Adatok_2026.txt 'Kassza' lap R5: F='Irattip.' — vagyis a TÉNYLEGES, könyvelő által beírt bizonylattípus (Chit. / Disp. / Fact. / OP / Extras). A Kassza lapon az „Irattip." oszlopra nincs legördülő korlátozás (a DATA VALIDATIONS csak I/K jogcím-listát és H/J összeg-, D dátum-szabályt tartalmaz), tehát szabad szöveg.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:129–133 `getDocType()`: `if (irattipus === 'Banki') return 'Extr'; return 'Chit.'` — pontos szövegegyezés. A ténylegesen tárolt értékek viszont 'készpénz', 'Chit.', 'Extr', 'OP', 'chitanta' vagy szabad importszöveg (vö. packages/core/src/finance/excel/row-builder.ts:45 `if (bankszamlaId) return 'Extr'`, és apps/web/.../penzugy/actions.ts:1867 `r.irattipus === 'készpénz'`). Ugyanez a `getDocType()` fut a Jurnal soraiban (504., 515. sor), miközben a kassza/bank szétválasztás ugyanott már helyesen `bankszamla_id` alapú (502., 513. sor — explicit „#5-fix: kassza = nincs bankszámla (nem az irattipus szövege)" komment). A Registru Banca ugyanezt már jól csinálja: 'Extr' bevételre, 'OP' kiadásra (425., 428. sor).

**Következmény:** A banki tételek a Főkönyvben „Chit." bizonylattípussal jelennek meg (Extras / OP helyett), a készpénzes KIADÁS is „Chit." (Dispoziție de plată helyett). A vizsgálatnál a Főkönyv 3. oszlopa nem egyezik a lefűzött bizonylattal — pontosan az a hibaosztály, amit a #5-fix a kassza/bank szétválasztásnál már orvosolt, csak a dokumentumtípusnál benne maradt.

#### 🟠 KÖZEPES — Hiányzik a „Sold total (6+7)" záró sor

**Hivatalos:** 'Fo_konyv' U7='Sold total (6+7)'; a negyedik záró sor G55='=IF(M51=$O$2,SUM(G54,H54),"")' = a készpénz-egyenleg és a bank-egyenleg összege. A záró blokk hivatalos sorrendje: Total luna (U1) → Total rulaj (U2) → Sold numerar(6-8) / Sold bancă (7-9) (U3) → Sold total (6+7) (U7).

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:578–580 — csak három záró sor épül fel: „Total luna", „Total rulaj", „Sold numerar (6-8) / Sold banca (7-9)". A negyedik sor sehol nincs.

**Következmény:** A lap nem mutatja az összesített (kassza + bank) záró vagyont, amit a hivatalos ív külön kiír; a részszámadással és a leltárral való összevetéskor kézzel kell összeadni, ami hibaforrás.

#### 🟠 KÖZEPES — Hiányzik a hivatalos ív 10. oszlopa: „Simb. cont."

**Hivatalos:** 'Fo_konyv' K8='Simb.', K9='cont.', a számozó sorban K10=10 — tehát a hivatalos nyomtatvány 10 oszlopos. Tartalma: K12='=IF($O$2>=M12,VLOOKUP(V12,Csfi,2,FALSE),"")', vagyis a tételhez rendelt költségvetési jogcím számlaszimbóluma.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:529 — kommentelt, szándékos eltávolítás: „2026-07-10 (S3 #1b): 'Simb. cont.' oszlop eltávolítva." A fejléc számozó sora 1–9 (573. sor), a törzs 9 cellát ír (530–540). A jogcímkód ki is számolódik (`code`, 509. és 520. sor), de sehol nem jelenik meg — halott mező.

**Következmény:** A kinyomtatott Főkönyv 9 oszlopos a hivatalos 10 helyett; a tétel nem köthető a költségvetési jogcímhez a lapon. A korábbi (S3 #1b) döntés a 2026-os hivatalos ívvel szemben áll.

#### 🟠 KÖZEPES — Két oldalas (față-verso) nyomtatás és kötésmargó nincs támogatva

**Hivatalos:** Valtozasok_2026.txt: „Kötelező kinyomtatni a Főkönyvet (Registru Jurnal), lehetőleg két oldalasan, a lap elejére-hátára. A kinyomtatott oldalak lefűzzük, öt évenként, vagy 200 lap terjedelmet követően kemény laptáblába beköttetjük." Ugyanez: 14_Egyhazi-adminisztracio…txt:712 („év végén lehetőleg két oldalasan (față-verso) kinyomtatjuk") és Sugo.txt:373–374.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:171 `@page { size: A4 landscape; margin: 0; }` + 174. sor `.page { … padding: 10mm; }` — minden lapon AZONOS, 10 mm-es körbemargó. Nincs `@page :left` / `@page :right` tükrözött (kötés-) margó, és a nyomtatási párbeszéd (packages/ui-app/src/finance/FinancePrintDialogBody.tsx) sem jelzi/állítja a duplexet.

**Következmény:** Kétoldalas nyomtatásnál a bekötés a belső oldalon elnyeli a táblázat szélét, mert nincs kötésre hagyott többletmargó. A lelkésznek a böngésző nyomtatási ablakában magának kell megtalálnia a „két oldalra" opciót — sehol nincs erre utaló figyelmeztetés.

#### 🟠 KÖZEPES — A Nr. crt. sorszám nem tárolt, minden nyomtatáskor újraszámolódik

**Hivatalos:** A sorszámot a 'Cs' segédlap CB oszlopa adja: CB7='=IF(COUNTIF($CD$7:CD7,CD7)=1,CD7,CD7+COUNTIF($CD$6:CD6,CD7))', CD7='=IF(CC7<>$CD$2,RANK(CC7,$CC$7:$CC$33000,1),$CD$2)' — dátum szerinti rangsor, holtverseny-eltolással, az EGÉSZ évre folytatólagosan, a kassza (7–10000. sor) és a bank (10007–33000. sor) blokkokra együtt. A Fo_konyv innen veszi: M12='=SUM(O1,M11)', O1 = a hónap első sorszáma.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:493–496 és 531 — `prevRowCount + i + 1`, ahol `prevRowCount` az előző hónapok tételszáma, nyomtatási időben újraszámolva. A `befizetes` / `kiadas` táblán nincs tárolt regiszter-sorszám (a migration-docs/sql-ben nincs ilyen oszlop/migráció).

**Következmény:** Egy utólag rögzített, visszadátumozott vagy stornózott tétel MINDEN utána következő sorszámot elcsúsztat, így az újranyomtatott lap sorszámai eltérnek a már lefűzött/bekötött lapokétól. Mivel a Főkönyv nem selejtezhető és bekötendő, ez utólag nem javítható eltérést okoz a papír és a rendszer között. (A hivatalos Excel is képlettel számol, de ott a hónap zárásakor nyomtatnak és a munkafüzet befagy — a Kartotékában nincs ilyen zárás.)

#### 🟡 KISEBB — Nincs bankszámla-jelölés a Document oszlopban

**Hivatalos:** 'Fo_konyv' D12='=IF($O$2>=M12,IF(O12=$O$9,"",UPPER(LEFT(O12,1))),"")', ahol O9='=Cs!CP1' = 'kassza'. Vagyis: kassza-tételnél üres, banki tételnél a bankszámla betűjele (A, B, C… — az Adatok_2026 munkafüzet 'A'…'T' banklapjai). A D oszlop a C-vel együtt alkotja a 3. („Document / Fel") oszlopot.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:571–572 és 530–540 — a Document alatt csak „Fel" és „Numar" van, bankszámla-jelölés nincs; a `bankszamla_id` csak a 6/7 ill. 8/9 oszlop szétválasztására szolgál (502., 513. sor).

**Következmény:** Több bankszámla esetén a Főkönyv sora nem köthető a megfelelő banknaplóhoz/kivonathoz — a 7. és 9. oszlop csak annyit mond, hogy „bank", de nem melyik.

#### 🟡 KISEBB — Azonos dátumú tételek sorrendje eltér a hivatalostól

**Hivatalos:** A 'Cs' lap sorszáma (CB) azonos dátumon belül a lap-sorrendet őrzi: előbb a KASSZA blokk sorai (Cs!7–10000, '=INDEX(Kassza,…)'), utána a BANKI blokk sorai (Cs!10007–33000). Tehát azonos napon belül kassza → bank a sorrend, bevétel/kiadás keverten, ahogy a kasszakönyvbe beírták.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:501–523 — előbb az ÖSSZES bevétel kerül a tömbbe (501–511), utána az ÖSSZES kiadás (512–522), majd stabil rendezés a formázott dátumra (523. sor). Így azonos napon belül minden bevétel megelőz minden kiadást, a kassza és a bank keveredik. (A rendezés maga helyes: az `fmtDate` ÉÉÉÉ.HH.NN alakot ad, 118–121. sor, tehát a `localeCompare` jól rendez.)

**Következmény:** Az azonos napi tételek más sorszámot kapnak, mint a hivatalos ívben; a Főkönyv és a kasszakönyv/banknapló összevetése tételről tételre nem egyezik, ami vizsgálatkor magyarázkodást igényel.

#### 🟡 KISEBB — Éves („Jan–Dec") mód: a stornó nem szűr az üres-hónap vizsgálatban

**Hivatalos:** A Főkönyvet hónap végén nyomtatják (Sugo.txt:373: „A főkönyvet hónap végén nyomtatjuk ki"), és a stornózott tétel nem szerepelhet a hivatalos regiszterben.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:1213–1214 — a `hasData` vizsgálat csak `!r.deleted`-et néz, `stornozott`-at NEM; a lapot építő `filterByMonth` (268. sor) viszont igen: `!r.deleted && !r.stornozott`.

**Következmény:** Ha egy hónapban csak stornózott tétel van, a rendszer generál egy ÜRES Főkönyv-lapot (fejléc + Report sor + záró sorok, tétel nélkül), ami feleslegesen kerül a bekötendő anyagba.

#### 🟡 KISEBB — Hiányzó román ékezetek a hivatalos nyomtatvány címében és fejlécében

**Hivatalos:** 'Fo_konyv' A6='REGISTRUL-JURNAL DE ÎNCASĂRI ŞI PLĂŢI'; R8: F='Explicaţii', G='Încasări', I='Plăți'; R9: I='Plăți'; U3='Sold numerar(6-8) / Sold bancă (7-9)'; U5='Report din luna precedentă: '.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:566 'REGISTRUL-JURNAL DE INCASARI SI PLATI'; 571–572 'Explicatii', 'Incasari', 'Plati', 'Banca'; 576 'Report din luna precedenta:'; 580 'Sold numerar (6-8) / Sold banca (7-9)'.

**Következmény:** Kozmetikai, de a nyomtatvány szövege szó szerint eltér a hivatalos ívtől — hatósági/egyházmegyei vizsgálatnál szembeötlő.

#### ℹ️ INFÓ — A nyitó egyenleg helye HELYES — a korábbi felmérés megállapítása nem hiba

**Hivatalos:** 'Fo_konyv' G11='=ROUND(SUM(Q5:Q6),2)', ahol Q5='=SUMIF(Cs!$CB$7:$CB$10000,$P$5,Cs!$CE$7:$CE$10000)' (a lap előtti készpénz-BEVÉTELEK) és Q6='=SUM(Cs!CQ1)'; Cs!CQ1='=INDEX(Kassza,1,6)' → az Adatok_2026 'Kassza' lap 6. sora (R6: G='Előző évi készpénzegyenleg: ') a névtartomány 6. oszlopában, ami a H = 'Bev. - Összeg'. Ugyanígy H11='=ROUND(SUM(BQ5:BQ6),2)', BQ6='=SUM(Cs!CQ2:CQ21)' = a bankszámlák nyitóinak összege; I11='=ROUND(R5,2)' és J11='=ROUND(BR5,2)' = a korábbi KIADÁSOK. Külön „sold initial" oszlop NINCS: az egyenleg a záró sorban áll elő, U3='Sold numerar(6-8) / Sold bancă (7-9)'.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:576 — a Report sor 6. oszlopa `prevCI + data.carryoverCash`, 7. oszlopa `prevBI + data.carryoverBank`, 8./9. `prevCE` / `prevBE`. A `carryoverCash`/`carryoverBank` az ÉVI rögzített nyitók (apps/web/app/(dashboard)/penzugy/actions.ts:1513–1522, `keszpenz_nyito_egyenleg` + `bankszamla_nyito_egyenleg` a resolve-nyito use-case-en át). A Total rulaj (579. sor) és a Sold (559–560., 580. sor) képlete is azonos a hivatalossal.

**Következmény:** NINCS teendő. A nyitó egyenleg valóban a forgalmi (Încasări) oszlopba kerül — de a hivatalos ív is pontosan ezt teszi, mert a Kassza lapon az „Előző évi készpénzegyenleg" maga is a bevétel-oszlopban áll. A korábbi felmérés ezt hibaként jelölte; a hivatalos ív alapján ez TÉVES. Javítani NEM szabad: ha a nyitót kivennénk a 6./7. oszlopból, a „Total rulaj" és a „Sold" sorok elrontanák az egyenleget.

### Ami teljesen hiányzik

- 40 soros lapokra tördelés a Registrul-Jurnal nyomtatványban (a hivatalos M3=40 sor/lap szerint) — a builderben nincs semmilyen darabolás (`ROWS_PER_PAGE`/chunk konstans nem létezik a packages/ui-app/src/finance/reporting.ts-ben)
- Lapzáró „De reportat pagina:" sor (hivatalos U4) és a következő lap nyitó „Report pagina precedentă:" sora (hivatalos U6) — csak a hónap-nyitó „Report din luna precedentă" (U5) van meg
- Folytatólagos, éven belül növekvő lapszám (hivatalos K55='="pg. "&N55', N55='=SUM(O5,O6)') — a Kartotékában `pg. 1` bedrótozva
- „Sold total (6+7)" záró sor (hivatalos U7)
- „Simb. cont." 10. oszlop (hivatalos K8/K9, számozó sorban K10=10)
- Bankszámla-betűjel a Document oszlopban (hivatalos D oszlop: UPPER(LEFT(bankszámla-lap neve,1)))
- Tükrözött kötésmargó (`@page :left` / `@page :right`) és bármilyen két oldalas (față-verso) nyomtatási beállítás vagy figyelmeztetés a nyomtatási párbeszédben
- Tárolt, változatlan regiszter-sorszám (Nr. crt.) a `befizetes` / `kiadas` táblán — a sorszám ma minden nyomtatáskor újraszámolódik
- Nyilvántartás arról, hogy egy hónap Főkönyve már ki lett nyomtatva és lefűzve, és hogy összesen hány lapnál tart a kötet (az „5 évenként vagy 200 lap után keményfedelesbe kötés" szabályhoz) — a migration-docs/sql-ben nincs ilyen tábla (fokonyv/registru/regiszter névre nincs találat)
- Hónapzárás (a Sugo szerint a havi kasszakönyv + Főkönyv kinyomtatása ZÁRJA a hónapot) — a Kartotékában a már kinyomtatott hónap tételei szabadon módosíthatók, ami a papírral szétcsúszást okoz

> **Megjegyzés:** FONTOS: a nyitó egyenlegre vonatkozó korábbi felmérés megállapítását ELLENŐRIZTEM és MEGCÁFOLTAM. A hivatalos ív (Kimutatasok_2026.txt 'Fo_konyv' G11/H11 ← Cs!CQ1 ← Adatok_2026 'Kassza' 6. sor „Előző évi készpénzegyenleg" a „Bev. - Összeg" oszlopban) MAGA IS a 6./7. forgalmi (Încasări) oszlopba teszi a nyitót a „Report" soron belül; nincs külön nyitó-oszlop, az egyenleg 6−8 / 7−9 különbségként áll elő. A Kartoteka ezt pontosan így csinálja — ezen NEM szabad változtatni, mert a „Total rulaj" és a „Sold" sorok is erre épülnek. — A vizsgálat kizárólag olvasás volt, semmilyen fájlt nem módosítottam. — Az összes eltérés a webet ÉS a desktopot is érinti, mert mindkettő a közös `buildFinancePrintDocument`-et hívja (apps/web/components/finance/finance-print-dialog.tsx:361, apps/desktop/src/components/finance-print-dialog.tsx:343), a builder pedig a C:\\Users\\endre\\Documents\\APPS\\Egyházi APP\\KARTOTEKA\\.claude\\worktrees\\admin-egyeztetes-leltar\\packages\\ui-app\\src\\finance\\reporting.ts fájlban van. — A lapokra tördeléshez már VAN minta ugyanebben a fájlban: a csoportnapló (1140–1160. sor) valódi `pg. N / M` számozással bont oldalakra; a Registrul-Jurnalhoz ezt kellene 40 soros lapokra és éven belül folytatólagos számozásra átszabni. — A 2026-os általános változások közül a Főkönyvet közvetlenül csak a „kötelező kinyomtatni, lehetőleg két oldalasan" előírás érinti; az A/B változat, az egyházmegye-név-függő legördülők és a készpénzhasználati limitek más területekhez tartoznak (a Főkönyv ezeket csak tükrözi, nem érvényesíti). — Az SQL-ekben a `'&lt;GYULEKEZET_UUID&gt;'` helyére a saját gyülekezet azonosítóját kell írni; mind read-only SELECT.

---

## 10. Kiadási kísérőív + Dispoziție de plată/încasare + Decont (elszámolás) — hivatalos EREK 2026 csomag vs. Kartotéka

A hivatalos csomag három nyomtatványt ír elő. (1) A kiadási kísérőívet a Kimutatasok_2026.xlsx 'Kiadasi_kiseroiv' lapja adja: forrásonként külön ív (F1 legördülő, AN1:AN13 = „Kassza", „A - számla" … „L - számla"), fejlécben a gyülekezet + „KIADÁSI KÍSÉRŐÍV" + a forrás neve + a nap kiadás-sorszám tartománya („N sz. kiadás" / „N - M sz. kiadások") + dátum; hatoszlopos táblázat (Kiad. sz. | Iratszám | Irat | Költségv. Tétel | Kiadás megnevezése | Összeg), FIXEN 20 sor/lap (A8:F27), „Összesen kiadás - <dátum>" záró sor, feltételes „…kiadási szám alatt vásárolt tárgy leltári száma: ____" sor (201.12 Kis értékű leltári tárgyak), két aláírás-hely legördülővel (Lelkipásztor/Esperes/Ellenőrízte és Gondnok/Főgondnok/Számvevő) és „pg. N" kumulatív lapszám. A Változások 2026 kifejezetten kimondja: „Ki kell nyomtatni a kiadási kísérőívet a készpénzes és a banki kifizetések mellé is." (2) A Dispoziție de plată/încasare către caserie (Dispozitie de plata_2026.xlsx, 'DP' lap) mezői: Parohia Reformată …, „Dispoziţie de plată/incasare către caserie", nr./din, Numele şi prenumele, Funcţia (calitatea), Suma (cifre + litere), Scopul încasării - plăţii, HÁROM vízum-blokk (Semnătura Conducătorul unităţii | Viza de control financiar-preventiv | Compartimentul financiar-contabil), csak kifizetésnél a beneficiar-blokk (Actul de identitate/Seria/Nr, Am primit suma de … în cifre, Data, Semnătura), végül a Casier blokk („Plătit/Incasat suma de" — SZÁMJEGGYEL). (3) A decont (Elszamolas_2026.xlsx, 'Elszamolas' lap): Unitate, DECONT DE CHELTUIELI/ELSZÁMOLÁS, sz./dátum, Név + Elszámolás jellege, „Avans primit (RON) - kapott előleg", „Total cheltuieli (RON) - összköltség", különbözet (de plată/de incasare), 7 oszlop × MAX 20 sor, Total, Decontat de / Aprobat, záró nyilatkozat. A Kartotéka mindhárom nyomtatványt ismeri (buildKiadasiKiseroiv a reporting.ts-ben, buildDecontHtml és buildDispozitieHtml az official-documents.ts-ben, decont/dispozitie táblák + atomikus sorszám-RPC), a mezőnevek nagyrészt szó szerint egyeznek, és a kísérőív forrás-választója tartalmazza a bankszámlákat is. A lényegi eltérések: nincs semmilyen ELŐLEG-fogalom (a 207.02-re való átvezetés nem kényszerített, a Dispoziție bármely kiadás-kategóriára könyvel), az 1 000 lej/nap/személy előleg-plafon sehol nincs érvényesítve (sőt a súgó két ellentmondó számot ír), a kísérőív nem lapoz 20 soronként és a „pg."/„sz. kiadás" jelentése is más, hiányzik a magyarázat + román magyarázat és a leltári szám sor, a DP-ről hiányzik a három hivatalos vízum-blokk, a decont pedig minden tételt EGYETLEN kiadás-kategóriára könyvel.

### Eltérések

#### 🔴 SÚLYOS — Az elszámolási előleg 1 000 lej/nap/személy plafonja sehol nincs érvényesítve — és a rendszer súgója két ellentmondó számot ír

**Hivatalos:** Valtozasok_2026.txt, 2. oldal: „Nem adhatunk ki előlegként elszámolásra (decont) 1 000 lejnél többet készpénzben vásárlási célra. Ezt a felső értéket naponta és személyenként kell értelmezni. (pl egy konferencia, vagy tábor megszervezésére nem adhatunk csak 1 000 lejt előlegként a bevásárlásokra)”. FIGYELEM, a hivatalos csomag önmagával ellentmondó: Utmutato_az_EREK_szamadasahoz.txt, 111. sor / 207.02: „Az előlegként kiadható összeg 5000 lej/személy/nap”. A Változások (Zabola, 2025. november 28.) az ÚJABB és szigorúbb — az az irányadó.

**Kartotéka ma:** packages/ui-app/src/finance/DecontTabBody.tsx:333 — a „Kapott előleg (RON)” szabad `type=number min=0 step=0.01` mező, felső korlát nélkül; apps/web/app/(dashboard)/penzugy/decont-actions.ts:277 `const advance = Number(input.advance) || 0` (nincs plafon-ellenőrzés); apps/web/app/(dashboard)/penzugy/dispozitie-actions.ts:327 csak `if (!(Number(input.amount) > 0))`. A súgóban: apps/web/components/finance/penzugy-help.tsx:1060 HELYESEN „1 000 lejnél többet”, de ugyanabban a modulban penzugy-help.tsx:1105-1106 „Az előlegként kiadható összeg 5000 lej/személy/nap”, és penzugy-help.tsx:633 (207.02 leírás) szintén „5000 lej/személy/nap”.

**Következmény:** A lelkész a rendszer saját súgójára hivatkozva adhat ki 5 000 lejes készpénz-előleget, amit 2026-ban a Legea 70/2015 és az EREK Változások tilt. Pénzügyi vizsgálatnál (Penzugyi_vizsgalat) ez tételes szabálysértés, a rendszer viszont még figyelmeztetést sem ad. A két ellentmondó szám ugyanabban a súgóban azt is jelenti, hogy nem lehet eldönteni, melyiket hitte el a könyvelő.

#### 🔴 SÚLYOS — Nincs „előleg” fogalom: a Dispoziție de plată bármely kiadás-kategóriára könyvelhet, a decont viszont MINDIG a 107.02-re vezet vissza — a 207.02 átvezetés nem kényszerített

**Hivatalos:** Utmutato_az_EREK_szamadasahoz.txt, 111. sor / 207.02 „Acordări de credite — Kiadott hitelek”: „Ide könyvelhetjük fel az elszámolásra előlegként kifizetett összeget, amit elszámoláskor visszaveszünk a »Visszakapott hiteleknél« és a kidást a kapott számlák alapján felkönyveljük a megfelelő kiadási tételhez.” Párja az 51. sor / 107.02: „…ha elszámolásra előleget ad ki, elszámoláskor itt vesszük vissza az összeget és elszámolás alapján a megfelelő helyre könyveljük fel a kiadásokat.” A 132. sor pedig a 207.02 és a 107.02 KÜLÖNBSÉGÉT kéri az év végi kinnlevőségek közé. Ez a projekt 2026-08-17-re halasztott nyitott kérdésének („átvezeti-e az előleget a 207.02-n kiadáskor?”) hivatalos válasza: IGEN.

**Kartotéka ma:** apps/web/app/(dashboard)/penzugy/dispozitie-actions.ts:405-421 — a `plata` ágban a kiadás a felhasználó által választott `input.categoryId`-re könyvelődik, semmi nem tereli a 207.02-re. A `dispozitie` táblában nincs előleg-jelző és nincs decont-kapcsolat (migration-docs/sql/2026-06-06-decont-dispozitie-sorszam.sql:97-119). Ezzel szemben apps/web/app/(dashboard)/penzugy/decont-actions.ts:38 `const DECONT_ELOLEG_VISSZAVET_KOD = '107.02'` FIXEN visszavezeti az előleget (decont-actions.ts:401-434), és a `decont.kapott_eloleg` szabadon gépelt szám (a DB-ben: numeric(14,2), semmilyen hivatkozás egy tényleges 207.02-es kiadásra).

**Következmény:** Ha az előleget nem 207.02-re könyvelik (ami ma az alapértelmezett helyzet, mert a rendszer nem kéri), akkor: a kassza egyenlege VÉLETLENÜL helyes lesz (mert a decont 107.02-es bevétele kiegyenlíti), de a SZÁMADÁS hamis — a valódi kiadási tétel (pl. 201.12 vagy 201.13) DUPLÁN szerepel, és a 107.02 „Visszakapott hitelek” hamis bevételt kap. A 132. sor (vissza nem kapott hitelek) sem jön ki. Fordítva is: ha a felhasználó 0-tól eltérő „kapott előleget” gépel be anélkül, hogy 207.02-es kiadás lenne, a rendszer néma készpénz-BEVÉTELT könyvel — a kasszakönyv többletet mutat a fizikai pénztárhoz képest.

#### 🔴 SÚLYOS — A kiadási kísérőívnek nincs 20 soros lapozása, és a „pg.” szám nem a hivatalos (kumulatív) lapszám

**Hivatalos:** Kimutatasok_2026.txt, 'Kiadasi_kiseroiv' lap: a tételsorok A8:F27 = pontosan 20 sor/lap; M2='=ROUNDUP(O1/20,0)' (az adott nap lapszáma), M7='=ROUND(SUM(M3,-1)*20,0)' (a lapon belüli eltolás), M8='=SUM(N1,M7)', M4='=IF(ISERROR(VLOOKUP(K2,BE1:BG366,3,FALSE))=FALSE,VLOOKUP(K2,BE1:BG366,3,FALSE)+M3,1)' (az év eleji kumulatív lapszám + lapon belüli sorszám), F33='="pg. "&M4'. Az A2 magyarázata: „Ezen a napon összesen N kiadási kísérőív lap van. Ebből jelenleg a(z) M látszik.”

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:619 `expenses.forEach((r, i) => {…})` — az adott nap MINDEN tétele egyetlen HTML-lapra kerül, nincs 20 soronkénti tördelés; apps/web/components/finance/kiseroiv-print-dialog.tsx:86-96 a `pageNumber` az adott forrás KIADÁSOS NAPJAINAK sorszáma (nap-index), nem lapszám; reporting.ts:664 `<div class="page-num">pg. ${pageNumber}</div>`.

**Következmény:** 20-nál több napi kiadásnál a Kartotéka nyomtatványa formailag eltér a hivatalostól (egy hosszú lap több helyett), és a „pg.” sorozat nem folytonos lapszámozás, ezért a lefűzött, kemény táblába kötendő anyagban a lapszámok nem stimmelnek az ellenőr számára.

#### 🔴 SÚLYOS — A kísérőív fejlécében a „N. sz. kiadás” valójában a NAP sorszáma, a táblázat „Kiad. sz.” oszlopa pedig lapon belüli index — a hivatalos mindkettőnél az évi futó kiadás-sorszámot írja

**Hivatalos:** Kimutatasok_2026.txt, 'Kiadasi_kiseroiv': E6='=TRIM(J5&J6&J7)', ahol J5='=IF(N1=M1,N1&" sz. kiadás","")' és J6='=IF(N1<M1,N1&" - "&M1&" sz. kiadások   ","")'; N1='=MIN(Cs!BS7:BS33000)', M1='=MAX(Cs!BS7:BS33000)' — vagyis az adott nap kiadásainak MIN/MAX FUTÓ sorszáma. A táblázat A8='=IF(AND($M$1>=M8,$M$1>0),M8,"")' szintén ezt a futó sorszámot (M8='=SUM(N1,M7)') írja ki.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:648 `<div>${pageNumber}. sz. kiad&aacute;s ${fmtDate(date)}</div>` — a `pageNumber` a nap-index; reporting.ts:630 `<td class="text-center">${i + 1}</td>` — a „Kiad. sz.” oszlop a lapon belüli 1..n index.

**Következmény:** A kísérőív nem hivatkozik a pénztárkönyv/Fő könyv futó kiadás-sorszámaira, ezért az ellenőr nem tudja a kísérőívet a kasszakönyvi/banknaplói sorokhoz kötni. Ötödik nap három kiadásánál a hivatalos „12 - 14 sz. kiadások”, a Kartotéka „5. sz. kiadás” feliratot nyomtat.

#### 🔴 SÚLYOS — A kísérőív „Kiadás megnevezése” oszlopából hiányzik a magyarázat ÉS a ROMÁN magyarázat — csak az átvevő neve kerül rá

**Hivatalos:** Kimutatasok_2026.txt, 'Kiadasi_kiseroiv' E8='=TRIM(IF(AND($M$1>=M8,$M$1>0),O8&" "&P8&" "&Q8,…))' — az O8/P8/Q8 a Cs munkalap 18./19./20. oszlopát hozza, amelyek fejlécei (Cs!CJ4, CK4, CL4): 'Név', 'Megjegyzés', 'Román magyarázat'. A Sugo.txt:369 szerint minden kiadás mellé KÖTELEZŐ kísérőívet nyomtatni és mellékelni a kiadási iratot.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:633-634 `const name = r.atvevo || ''` … `<td>${esc(name)}</td>` — csak az átvevő neve; a meglévő `megjegyzes` mező (packages/ui-app/src/finance/types.ts:407) nem kerül a nyomtatványra. Román magyarázat oszlop a `kiadas` táblában EGYÁLTALÁN NINCS (migration-docs/Database_schema.sql:286-323).

**Következmény:** Román nyelvű pénzügyi ellenőrzésnél (Penzugyi_vizsgalat) a bizonylat magyarázat nélkül marad — a hivatalos űrlap éppen ezért kér külön román magyarázatot. A Kartotéka nyomtatványán a kiadás célja csak a Költségvetési tétel nevéből következtethető ki.

#### 🟠 KÖZEPES — Hiányzik a kísérőívről a leltári szám sor a kis értékű leltári tárgyak (201.12) beszerzésénél

**Hivatalos:** Kimutatasok_2026.txt, 'Kiadasi_kiseroiv' A29='=TRIM(IF(U7=1,"A(z) "&V29&". kiadási szám alatt vásárolt tárgy leltári száma: _________",IF(U7>1,"A(z) "&V29&". kiadási számok alatt vásárolt tárgyak leltári száma: "&W29,"")))' — akkor jelenik meg, ha a lapon van az L7 tételre könyvelt sor (L8='=IF(D8=$L$7,1,0)'). Az érintett költségvetési tétel az Utmutato_az_EREK_szamadasahoz.txt 65. sora: 201.12 „Obiecte de inventar (de mică valoare, scurtă durată) — Kis értékű leltári tárgyak beszerzése” (2 500 lej alatti tárgyak).

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:644-665 — a `buildKiadasiKiseroiv` HTML-jében nincs ilyen blokk; a nyomtatvány a totál sor után egyből az aláírásokra megy.

**Következmény:** A megvásárolt leltári tárgy és a leltár közötti PAPÍR-kapcsolat elmarad: a kísérőívről nem derül ki, milyen leltári számot kapott a beszerzett tárgy. Ez pontosan az a kapocs, amit a vagyonleltár-ellenőrzés keres.

#### 🟠 KÖZEPES — A kísérőív alapértelmezett forrása a „Minden kiadás (kassza + bank)” — ilyen a hivatalosban nem létezik, és szembemegy az irat-rendezési szabállyal

**Hivatalos:** Kimutatasok_2026.txt, 'Kiadasi_kiseroiv' F1 legördülő, forrás-lista AN1:AN13 = 'Kassza', 'A - számla', 'B - számla', … 'L - számla' — vagyis FORRÁSONKÉNT külön ív, vegyes ív nincs. Sugo.txt:369-371: „Minden kiadás mellé kötelezően ki kell nyomatni kiadási kísérőívet. Mellékelni kell a kiadási iratot, és külön-külön iratgyűjtőkbe lefűzni a kassza és a bankszámlák iratait.”

**Kartotéka ma:** apps/web/components/finance/kiseroiv-print-dialog.tsx:60 `const [source, setSource] = useState<KiseroivSource>('mind')` — az ALAPÉRTELMEZETT a „mind”; :211 `<option value="mind">Minden kiadás (kassza + bank)</option>`; a `matchesSource` (:42-46) ekkor mindent átenged.

**Következmény:** Aki nem nyúl a forrás-választóhoz (a legvalószínűbb eset), olyan lapot nyomtat, amelyen keveredik a kassza és a bankszámla kiadása — ez egyik hivatalos iratgyűjtőbe sem fűzhető le, és a rajta lévő „pg.” sorozat sem felel meg egyik hivatalos sorozatnak sem.

#### 🟠 KÖZEPES — A banki kifizetésekhez tartozó kísérőív elvileg elkészíthető, de a banki munkafolyamatból nem elérhető (nincs gomb a Bank fülön, és a Nyomtatási központból mindkét platformon ki van szűrve)

**Hivatalos:** Valtozasok_2026.txt, 1. oldal, „Miket kell kinyomtatni?”: „Ki kell nyomtatni a kiadási kísérőívet a készpénzes és a banki kifizetések mellé is.” Sugo.txt:213: „Kiadási kísérőív: Itt lehet nyomtatni a kiadási kísérőívet a kassza és a banki kiadásokhoz.”

**Kartotéka ma:** A kísérőív-gomb EGYETLEN helye a Tranzakciók fül dátum-fejléce: packages/ui-app/src/finance/TransactionsTab.tsx:659-669. A Nyomtatási központ mindkét platformon KISZŰRI: apps/web/components/finance/finance-print-dialog.tsx:143 és apps/desktop/src/components/finance-print-dialog.tsx:148 `...FINANCE_PRINT_TYPES.filter((t) => t.id !== 'kiadasi_kiseroiv')`. A BankTab.tsx-ben nincs kísérőív-hivatkozás. (Pozitívum: a dialóguson belüli forrás-választó kiseroiv-print-dialog.tsx:213-217 FELSOROLJA a bankszámlákat, tehát a képesség megvan.)

**Következmény:** A lelkész a Bank fülön dolgozva nem talál kísérőív-gombot, a Nyomtatási központban pedig egyáltalán nincs ott a nyomtatvány — így a banki kifizetések mellé a kötelező kísérőív nagy valószínűséggel elmarad, holott a rendszer tudná előállítani.

#### 🟠 KÖZEPES — A Dispoziție de plată nyomtatványról hiányzik a három hivatalos aláírás/vízum blokk

**Hivatalos:** Dispozitie_de_plata_2026.txt, 'DP' lap 15-16. sor: C15='Semnătura', D15='Conducătorul', D16='unităţii' | F15='Viza de control', F16='financiar-preventiv' | H15='Compartimentul', H16='financiar-contabil' (mindkét példányon, M15/N15/N16, P15/P16, R15/R16). Ez az OMFP 2634/2015 cod 14-4-4 nyomtatvány kötelező eleme.

**Kartotéka ma:** packages/ui-app/src/finance/official-documents.ts:249-265 (`dispozitieCopy`) — a Scopul sor után egyből a beneficiar-blokk, majd a „Casier,” blokk jön; a Conducătorul unităţii / Viza de control financiar-preventiv / Compartimentul financiar-contabil hármas SEHOL nincs a HTML-ben.

**Következmény:** A kiállított Dispoziție formailag hiányos a román pénzügyi szabvány szerint: hiányzik az utalványozó, az előzetes pénzügyi kontroll és a könyvelés vízuma. Ellenőrzésnél kifogásolható bizonylat.

#### 🟠 KÖZEPES — A decont MINDEN tételét EGYETLEN kiadás-kategóriára könyveli — a hivatalos szerint számlánként a megfelelő tételhez kell könyvelni

**Hivatalos:** Utmutato_az_EREK_szamadasahoz.txt, 51. sor / 107.02: „…elszámoláskor itt vesszük vissza az összeget és elszámolás alapján a MEGFELELŐ HELYRE könyveljük fel a kiadásokat.”; 111. sor / 207.02: „…a kidást a kapott számlák alapján felkönyveljük a MEGFELELŐ KIADÁSI TÉTELHEZ.” Az Elszamolas_2026 'Adatok' lapon minden tétel külön 'Irat kiállítója' (K5) és 'Magyarázat' (L5) mezőt kap, tehát egy elszámolásban vegyes jellegű számlák szerepelhetnek.

**Kartotéka ma:** packages/ui-app/src/finance/DecontTabBody.tsx:279 `items: docItems.map((r) => ({ ...r, id_kiadascel: Number(categoryId) }))` — a UI MINDEN sorra ugyanazt a kiválasztott kategóriát írja; az űrlapon egyetlen „Kiadás-kategória *” mező van (DecontTabBody.tsx:343-345). A szerver ezt átveszi: apps/web/app/(dashboard)/penzugy/decont-actions.ts:364 `id_kiadascel: r.id_kiadascel || input.defaultCategoryId`.

**Következmény:** Ha egy elszámolásban vegyes számlák vannak (pl. üzemanyag + karbantartási anyag + kis értékű leltári tárgy), a számadás kiadási sorai torzulnak: az egész összeg egyetlen tételre kerül. A hiba NÉMA — a decont papíron helyesnek látszik, csak a Csoportnapló/Számadás bontása lesz hamis.

#### 🟠 KÖZEPES — A decontnak nincs 20 tételes felső korlátja, a hivatalos űrlap viszont egy lapra 20 sort enged

**Hivatalos:** Elszamolas_2026.txt, 'Elszamolas' lap: a tételsorok C15:I34 = 20 sor; C2='=IF(O3>20,L10,"")' és L10='Egy lapra bőven elég 20 sor. Ebben az elszámolásban több mint 20 sor lenne. Kezdj egy újat.'

**Kartotéka ma:** packages/ui-app/src/finance/DecontTabBody.tsx:261 `function addRow() { setRows((cur) => [...cur, createRow()]) }` — korlátlan; packages/ui-app/src/finance/official-documents.ts:59-72 minden tételt egyetlen táblába renderel; a szerveren (decont-actions.ts:255-258) csak `items.length === 0` ellenőrzés van.

**Következmény:** 20-nál több tételes elszámolásnál a nyomtatvány több oldalra folyik, ami eltér a hivatalos egy-lapos űrlaptól, és a záró nyilatkozat/aláírás-blokk elszakad a tételektől.

#### 🟠 KÖZEPES — A Dispoziție nyomtatványon a „Am primit suma de” és a „Plătit/Incasat suma de” sor a hivatalos szerint SZÁMJEGYET vár, a Kartotéka betűvel írja

**Hivatalos:** Dispozitie_de_plata_2026.txt, 'DP' lap: G22='=X22' ahol X22='=TRIM(IF($W$1=$Y$2,"",Z9&Y9))' (Z9 = a számjegyekből összefűzött összeg, Y9=' lei '), és alatta G23='(în cifre)'. Ugyanígy D28='=X28&Z9&Y9' (X28='Plătit suma de: ' / 'Incasat suma de: ') és E29='(în cifre)'. A betűs alak külön, a C9-ben szerepel (AH22 = 'adică …').

**Kartotéka ma:** packages/ui-app/src/finance/official-documents.ts:233 `Am primit suma de: ${esc(words)} &nbsp;<span class="muted">(în litere)</span>` és :263 `${casierLine}${esc(words)} &nbsp;<span class="muted">(în litere)</span>` — mindkét helyen a BETŰS alak áll, „(în litere)” felirattal.

**Következmény:** Mezőtartalom-eltérés a hivatalos űrlaptól: az átvételi és a pénztárosi sorban a számszerű összeg nem jelenik meg, csak betűvel. Formai kifogás alapja lehet.

#### 🟠 KÖZEPES — Desktop paritás: a Decont és a Dispoziție csak a webes alkalmazásban létezik

**Hivatalos:** A hivatalos csomag offline Excel-alapú; a Kartotéka desktop (Tauri) változata a helyi/offline munkára készült, tehát ott is elő kell tudni állítani a bizonylatokat.

**Kartotéka ma:** Az apps/desktop/src fa alatt egyetlen fájl említi a decontot/dispozíciót: apps/desktop/src/components/finance-print-dialog.tsx (és ott is csak a kísérőív kiszűrése, :148). A `DecontTabBody` és a `DispozitieDialogBody` megosztott komponenseket kizárólag a web köti be (apps/web/components/finance/decont-tab.tsx:24, apps/web/components/modals/dispozitie-dialog.tsx:66). A szerver-akciók (`decont-actions.ts`, `dispozitie-actions.ts`) Next.js 'use server' fájlok, a desktopról nem hívhatók.

**Következmény:** Offline (desktop) módban nem állítható ki sem Dispoziție de plată, sem decont — pedig ezek pont a pénztári, papír-alapú munkához kellenek. A gyülekezetben internet nélkül dolgozó könyvelő kénytelen az Excelhez visszanyúlni.

#### 🟠 KÖZEPES — A készpénzhasználati értékhatárok (50 000 kasszaplafon, 5 000 / 10 000 napi limitek, feldarabolás tilalma) csak SÚGÓ-szövegként vannak jelen, semmilyen ellenőrzés nem fut rájuk

**Hivatalos:** Valtozasok_2026.txt, „Készpénzhasználat” fejezet: 50 000 lej kasszaplafon (a többletet 3 napon belül bankba); tilos készpénzben kölcsönt adni; max 5 000 lej/nap egy másik jogi személytől; összesen max 10 000 lej/nap kifizetés cégeknek, egyetlen cégnek sem több 5 000-nél; 5 000 lej feletti számla csak 5 000-ig készpénzzel; „Nem oszthatjuk fel a kifizetést kisebb részekre”; magánszemélytől/-nek max 10 000 lej/nap (kivéve az alkalmazott havi fizetése).

**Kartotéka ma:** apps/web/components/finance/penzugy-help.tsx:1040-1100 helyesen leírja mindet, de a kódban SEMMILYEN érvényesítés nincs: a `penzugy` szerver-akciókban, a `packages/core/src/finance`-ban és a `packages/validations/src/finance`-ban egyetlen készpénz-limit ellenőrzés sem található (az egyetlen plafon-figyelő a TVA-é: apps/web/lib/finance/tva-plafon.ts).

**Következmény:** A rendszer némán elfogad 60 000 lejes kasszaegyenleget, 8 000 lejes készpénzes cégfizetést vagy szabálytalanul feldarabolt kifizetést. A könyvelő csak a pénzügyi vizsgálaton szembesül vele. Legalább figyelmeztető (nem blokkoló) jelzés indokolt lenne, a TVA-plafon figyelő mintájára.

#### 🟡 KISEBB — A Dispoziție címéből hiányzik a „către caserie” tagmondat

**Hivatalos:** Dispozitie_de_plata_2026.txt, 'DP' lap C5='=X5&W2&Z5', ahol X5='Dispoziţie de ', W2 = 'plată' / 'incasare', Z5=' către caserie' — a nyomtatott cím tehát „Dispoziţie de plată către caserie”, illetve „Dispoziţie de incasare către caserie”.

**Kartotéka ma:** packages/ui-app/src/finance/official-documents.ts:222 `const titlu = isPlata ? 'Dispoziție de plată' : 'Dispoziție de încasare'` — a „către caserie” rész hiányzik.

**Következmény:** A nyomtatvány címe nem a cod 14-4-4 szerinti teljes megnevezés. Kicsi, de egy formai ellenőrzésnél szemet szúró eltérés.

#### 🟡 KISEBB — A kísérőív fejlécében fix „Registrul-Jurnal” felirat áll — a hivatalos ide a FORRÁS megnevezését írja

**Hivatalos:** Kimutatasok_2026.txt, 'Kiadasi_kiseroiv' A6='=TRIM(T1&U1)', T1='=IF(VLOOKUP(P2,AO1:AR21,4,FALSE)<>"",VLOOKUP(P2,AO1:AR21,4,FALSE)&" "&IF(F1<>AN1,F1,""),F1)'; kassza esetén AR1='Kasszakönyv' → a fejléc „Kasszakönyv”, bankszámlánál a bank neve + „A - számla”. A 'Registru Jurnal' a Fő könyv (Fo_konyv lap), NEM a kísérőív.

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:648 — a fejléc jobb oldalán `<div>Registrul-Jurnal</div>` fix felirat, mellette külön „Forrás: …” sor (reporting.ts:639).

**Következmény:** A hivatalos iraton egy másik nyomtatvány (Registrul-Jurnal = Fő könyv) neve szerepel — félrevezető felirat egy aláírandó bizonylaton.

#### 🟡 KISEBB — A kísérőív aláírás-blokkja eltér: a hivatalos 2 hely (legördülőkkel), a Kartotékában 3 fix felirat

**Hivatalos:** Kimutatasok_2026.txt, 'Kiadasi_kiseroiv': A30='Lelkipásztor', E30='Főgondnok'; DATA VALIDATIONS: type=list f1='$J$30:$J$32' sqref=A30:B30 (J30='Lelkipásztor', J31='Esperes', A32/J32='Ellenőrízte') és type=list f1='$K$30:$K$32' sqref=E30:F30 (K30='Gondnok', K31='Főgondnok', K32='Számvevő').

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:659-663 — három fix aláírás-hely: „Lelkipásztor”, „Ellenőrizte”, „Gondnok”; nincs szerepválasztás (esperes/számvevő nem választható).

**Következmény:** Egyházmegyei ellenőrzéskor (esperes/számvevő aláírása) a nyomtatványt kézzel kell átírni; a három hasáb helypazarlás és eltérő elrendezés a hivataloshoz képest.

#### 🟡 KISEBB — A `kiadasikiseroiv` tábla létezik a sémában, de a rendszer soha nem írja/olvassa — a kísérőív egyáltalán nem perzisztált

**Hivatalos:** —  (a hivatalos Excelben sem perzisztált, ott is képlet számolja; de az Excelben az adatbevitel kronologikus, itt nem.)

**Kartotéka ma:** migration-docs/Database_schema.sql:338-349 `CREATE TABLE public.kiadasikiseroiv (id, id_kiadas, iratszam, datum, megjegyzes, …)` — nincs `congregation_id`, nincs `deleted`. A kódban CSAK kommentben szerepel: packages/core/src/finance/kiadas/storno.ts:9 és packages/validations/src/finance/kiadas-delete.ts:11 („…táblához NINCS cascade”). RLS: migration-docs/sql/2026-04-13-rls-ALL-FIXED.sql:124 `CREATE POLICY kiadasikiseroiv_read ON public.kiadasikiseroiv FOR SELECT TO authenticated USING (true);` — a szűkítést a 2026-08-10-nyitott-rls-policyk-takaritas.sql tervezi, de az egy futtatásra váró SQL.

**Következmény:** (1) A kiállított kísérőívek sorszáma nem rögzül: ha utólag kerül be egy korábbi dátumú kiadás vagy stornóznak egyet, MINDEN későbbi kísérőív „pg.” száma elcsúszik a már kinyomtatott papírokhoz képest. (2) A tábla nyitott (USING true) olvasási felület marad, holott nincs használatban.

### Ami teljesen hiányzik

- Nem tudtam ellenőrizni, hogy az ÉLES adatbázisban létezik és aktív-e a 207.02 kiadás-kategória (`kiadascel`) és a 107.02 bevétel-kategória (`befizetescel`) — a migration-docs/sql/2026-06-11i-hianyzo-hivatalos-kategoriak.sql lefutása nincs igazolva (lásd a MEMORY.md „a migration-fájl NEM bizonyíték” hibaosztályát). Az 1. SQL-ellenőrzés erre való.
- A hivatalos csomag ÖNMAGÁVAL ellentmondó az előleg-plafonban (Változások 2026: 1 000 lej; Útmutató 207.02: 5 000 lej/személy/nap). Nem tudom eldönteni, melyik a szándékolt — a dátum alapján (2025.11.28) a Változások az újabb, de ezt Beke Tivadarnál érdemes tisztázni, mielőtt a kódba plafon kerül.
- A Cs munkalap „Több kiadás” (BS) oszlopának képletét a szöveges kivonatból nem tudtam kibontani (a Kimutatasok_2026.txt túl nagy, a Cs lap BS7 sora nem szerepelt a mintában), így a hivatalos kiadás-sorszám képzésének utolsó lépését nem igazoltam 100%-ban — a fejléc/oszlop szemantikáját viszont igen (N1/M1 = MIN/MAX BS).
- Nem vizsgáltam az Anyagraktárkönyv saját „Kiadási kísérőív” lapját (Anyagraktarkonyv.txt) — az ANYAGKIADÁS kísérőíve, más nyomtatvány, mint a pénztári kiadási kísérőív; a Kartotékában ennek megfelelője nem került elő.
- Nem futtattam SQL-t (nincs élő DB-hozzáférésem ehhez a projekthez — a Supabase MCP a Baratosi Projectre mutat, nem a Kartotékára). Az alábbi lekérdezések a felhasználó általi futtatásra készültek.
- Nem néztem meg nyomtatásban, hogy a Dispoziție két példánya (a Kartotékában EGYMÁS ALATT, a hivatalosban EGYMÁS MELLETT: C..J és M..R oszlopok) elfér-e egy A4-en — a kódban `min-height: 100mm` × 2 + margók, ami elvben elfér, de PDF-ben ellenőrizendő.

> **Megjegyzés:** A vizsgálat kizárólag olvasás volt — egyetlen fájlt sem módosítottam. A legfontosabb egyetlen mondatban: a rendszer a decont ZÁRÁSÁT (107.02 visszavezetés) helyesen csinálja, de az előleg KIADÁSÁT (207.02) nem ismeri, és semmilyen összegplafont nem érvényesít — így a kassza egyenlege stimmel, a számadás viszont némán elcsúszhat. A projekt 2026-08-17-re halasztott nyitott kérdésére („átvezeti-e az előleget a 207.02-n kiadáskor?”) a hivatalos válasz megvan és egyértelmű: IGEN, az Útmutató 111. sora (207.02) szó szerint ezt írja elő, a visszavétel pedig az 51. soron (107.02) történik, és a kettő különbségét az év végi kinnlevőségek 132. sorába kell írni. Két, gyorsan javítható tétel emelkedik ki: (1) a penzugy-help.tsx:1105-1106 és :633 helyeken lévő „5000 lej/személy/nap” szöveg 2026-ra téves — a Változások 2026 szerint 1 000 lej/nap/személy; ez ma AKTÍVAN rossz tanácsot ad a lelkésznek. (2) A kiadási kísérőív a Nyomtatási központból mindkét platformon ki van szűrve (finance-print-dialog.tsx:143 és apps/desktop/.../finance-print-dialog.tsx:148), pedig a Változások 2026 kifejezetten kéri a banki kifizetések mellé is — a képesség megvan (a forrás-választó felsorolja a bankszámlákat), csak nem elérhető ott, ahol a lelkész keresné. Külön figyelmet érdemel, hogy maga a hivatalos csomag ellentmond önmagának az előleg-plafonban (Változások: 1 000 lej vs. Útmutató 207.02: 5 000 lej) — mielőtt kódba kerül a korlát, ezt érdemes Beke Tivadarnál tisztázni.

---

## 11. Adatok_2026 — kasszakönyv és banknapló adatbevitel (Kassza / Kasszakonyv / A–T banklapok vs. Kartotéka Kassza + Bank fül)

A hivatalos Adatok_2026.xlsx-ben a napi adatbevitel a "Kassza" lapon (készpénz) és az A–T betűjelű lapokon (bankszámlánként egy-egy lap, max. 20) történik; mindkettő oszloprendje azonos (5. sor): D=Dátum, E=Iratszám, F=Irattip., G=Név, H=Bev.-Összeg, I=Bevétel-Költ.vet. név, J=Kiad.-Összeg, K=Kiadás-költ.vet. név, L=Megjegyzés, M=Magyarázat (auto román név, FELÜLÍRHATÓ), N=Költségvetési szám (auto VLOOKUP). Az adat a 7. sortól indul, a H6 cella az "Előző évi (készpénz)egyenleg"; a lap tetején élő képlet adja a Napi bevételt (H1), Napi kiadást (H2) és az Egyenleget (H3), a Kassza I2 cellája pedig 50 000 lej felett élesben figyelmeztet a kasszaplafonra. A napi zárás a "Kasszakonyv" lapon jelenik meg (REGISTRU DE CASĂ, 30 sor/oldal: Sold ziua precedentă → Total → Sold zi → De reportat pagina), a HAVI zárás pedig a Kimutatasok_2026 "Naplo" lapján (REGISTRU CASĂ/BANCĂ, Sold luna precedentă → TOTAL LUNA, 40 sor/oldal); a Változások szerint a hónapot a kinyomtatott havi kasszakönyvvel kell lezárni, a banknaplót viszont csak év végén, egyszer, a Jan_Dec opcióval. A Kartotéka Kassza füle (CashbookTab.tsx) és Bank füle (BankTab.tsx) minden beviteli mezőt ismer, a nyitó egyenlegek évenként rögzítettek (keszpenz_nyito_egyenleg / bankszamla_nyito_egyenleg), az Excel-export oszloprendje 1:1 a hivatalos D–L oszlopokkal, és a hivatalos xlsx importja fejléc-alapon ismeri fel az oszlopokat. Ami hiányzik: nincs HAVI zárás/zárolás (csak éves accounting_finalized), nincs kasszaplafon-jelzés, nincs napi egyenleg és napi összesítés, a listák fordított időrendben állnak, a nyomtatott regiszterekből kimarad a Megjegyzés, felülíródik a felhasználó által megadott irattípus, és csak 5 belső-mozgás kód él a hivatalos, számlánkénti készlet helyett. A kategória-katalógus viszont naprakész: az excel-2026-katalogus.json 927 tétele a 2026-os Szamadas lap neveivel egyezik.

### Eltérések

#### 🔴 SÚLYOS — Nincs HAVI zárás — a hónapot a havi kasszakönyvvel kellene lezárni

**Hivatalos:** Valtozasok_2026.txt, 1. oldal: „Hónap végén ki kell nyomtatni egy példányban a havi kasszakönyvet, és azzal zárjuk le a hónapot.” + Penzugyi_vizsgalat.txt, 1. oldal: „Kasszakönyv havonként nyomtatva”. A havi lapot a Kimutatasok_2026 'Naplo' lapja adja (E5='REGISTRU CASĂ', N5='TOTAL LUNA', U1='Sold luna precedentă').

**Kartotéka ma:** A havi Registru Casa nyomtatása MEGVAN (packages/ui-app/src/finance/reporting.ts:310 buildRegistruCasa), de zárás-állapot NINCS: az egész repóban csak ÉVES véglegesítés létezik (bealitas.accounting_finalized, migration-docs/Database_schema.sql:102). Havi zárolást jelző oszlop/tábla nincs a sémában.

**Következmény:** A már kinyomtatott és lefűzött havi kasszakönyv sorai utólag is szerkeszthetők/stornózhatók. A papír és az adatbázis NÉMÁN széthúz — a pénzügyi vizsgálaton a nyomtatott lap már nem egyezik a rendszerrel, és nincs nyoma, mikor tért el.

#### 🔴 SÚLYOS — A nyomtatott regiszterek Explicaţii oszlopából KIMARAD a Megjegyzés

**Hivatalos:** Adatok_2026 'Kasszakonyv' D9='=TRIM(IF($M$1>=M9,O9&" "&P9&" "&Q9,...))', ahol O=Magyarázat (Kassza M), P=Név (Kassza G), Q=Megjegyzés (Kassza L). Kimutatasok_2026 'Naplo' E11='=IF(L11<=$P$3,TRIM(R11&" "&S11&" "&T11),...)'. Sugo.txt 174. sor: „Az ide beírt megjegyzés bekerül a Főkönyvbe, a banknaplóba és csoportnaplóba. Itt meg lehet különböztetni a költségvetési tételeken belül az altételeket (pl. a közköltségeknél a fűtés, világítás, víz, szemét stb.)”

**Kartotéka ma:** packages/ui-app/src/finance/reporting.ts:151-160 getDescription() → `const parts = [name, cel?.nevro || cel?.nev]` — a `megjegyzes` mezőt SOHA nem fűzi hozzá. Ez a függvény adja az Explicaţii-t a Registru Casa (:325, :333), Registru Banca (:425, :428) és Registrul-Jurnal (:505, :516) lapokon egyaránt.

**Következmény:** A lelkész által beírt altétel-bontás (fűtés/világítás/víz/szemét, pályázat-azonosító, szerződésszám) eltűnik mindhárom hivatalos regiszterből. A számvevő a nyomtatott lapon nem tudja szétválasztani az azonos jogcímű tételeket.

#### 🔴 SÚLYOS — A rögzített Irattípus felülíródik a nyomtatott regiszterben (mindig Chit./Extr/OP)

**Hivatalos:** Kassza és A–T lapok F5='Irattip.'; Sugo.txt 154. sor: „Az iratok típusa: nyugta (chitanta), számla (factura) stb. rövidített megnevezését lehet beírni ide.” — SZABAD SZÖVEG, a lefűzött irathoz igazodva.

**Kartotéka ma:** reporting.ts:129-133 getDocType(): `if (irattipus === 'Banki') return 'Extr'; return 'Chit.'` — minden készpénzes sor 'Chit.'. buildRegistruBanca (:425/:428) egyáltalán meg sem nézi: bevétel='Extr', kiadás='OP'. Közben a tárolt érték szabad szöveg (packages/validations/src/finance/befizetes-save.ts:20 `z.string().trim().min(1).max(50)`), és a fül ki is írja (CashbookTab.tsx:1026).

**Következmény:** Egy Factură vagy Dispoziţie de plată alapján kifizetett készpénzes tétel a hivatalos Registru Casa-n „Chit.”-ként jelenik meg, miközben a lefűzött irat számla. A regiszter ellentmond a mellékelt bizonylatnak.

#### 🔴 SÚLYOS — Csak 5 belső-mozgás kód él — a 2. és további bankszámla rossz nevet kap

**Hivatalos:** Adatok_2026 'Hibak' lap Z–BT oszlopai, 101–120. sor: SZÁMLÁNKÉNTI készlet, pl. Z112='Készpénzfelvétel a(z) L számláról', AZ112='Készpénzletétel a(z) L számlára', AL112='Átutalva a(z) K számláról - L'. A Hibak C7:C27 minden számlapárra (kassza + A…T = 21) külön ellenőrzi, hogy a kivezetés és a bevezetés találkozik-e (C8='=IF(ROUND(SUM(Z132,-Z161),2)<>0,...)').

**Kartotéka ma:** migration-docs/sql/2026-06-11e-belso-mozgas-takaritas.sql a KANONIKUS modellre szűkít: 300.01 / 301.01 / 400.01 / 401.01 / 402.02. A write-path ezt használja számlától függetlenül: CombinedEntryBody.tsx:48-50 (`DEPOSIT_KODS = new Set(['400.01','301.01'])` stb.). A teljes, 20-számlás névkészlet CSAK a desktop Excel-write-through modulban van meg (packages/core/src/finance/excel/belso-mozgas-nevek.ts), a törzsben (szamadasicel) a repó SQL-jei szerint nincs 300.02–300.20 / 400.02–400.20.

**Következmény:** Két vagy több bankszámlánál a B/C/... számlára tett készpénzletétel is a 400.01 = „Készpénzletétel a(z) A számlára” kódot kapja. Az Excel-exportba ez a név megy (finance-export.ts, celNev), így a hivatalos munkafüzet Hibak-mátrixa hibát jelez, és a SUMIF rossz számlalapra összegez.

#### 🟠 KÖZEPES — Nincs 50 000 lejes kasszaplafon-figyelmeztetés

**Hivatalos:** Adatok_2026 'Kassza' I2='=IF(H3>50000,"Az egyenleg meghaladta a kasszaplafont. Le kell tenni a készpénzt a bankszámlánkra!!!","")' — ÉLŐ, minden mentés után frissülő jelzés. Valtozasok_2026.txt: a többletet 3 napon belül bankba kell tenni.

**Kartotéka ma:** A szabály DOKUMENTÁLVA van (apps/web/components/finance/penzugy-help.tsx:1050), de sehol nincs ellenőrzés: a repóban egyetlen kasszaplafon/50000-es küszöb-vizsgálat sincs. A CashbookTab „Záró egyenleg” KPI-je (CashbookTab.tsx:637) küszöb nélkül mutatja az összeget.

**Következmény:** A gyülekezet észrevétlenül átlépheti a törvényes kasszaplafont; a 3 napos betétkötelezettség lecsúszik. A hivatalos Excel ezt magától jelzi, a Kartotéka nem — aki átáll, egy meglévő védelmet veszít el.

#### 🟠 KÖZEPES — A Kassza/Bank fül fordított időrendben listáz, és nincs napi egyenleg / napi összesítés

**Hivatalos:** 'Kasszakonyv' A7='Nr.crt / S.sz.' szigorú növekvő sorrendben, T4='Sold zi - Napi egyenleg -', T3='Total - Összesen'. 'Kassza' G1='Napi bevétel: ', G2='Napi kiadás: ', G3='Egyenleg: '. Kimutatasok 'Naplo' H7/H8='Sold zi'.

**Kartotéka ma:** CashbookTab.tsx:240-241 `sortBy='datum'`, `sortDir='desc'` (alapból LEGÚJABB elöl), a havi csoportok is csökkenő sorrendben (`[...groups.entries()].sort((a,b)=>b[0]-a[0])`). Ugyanez BankTab.tsx:287-288. A KPI-k HAVI szintűek (Nyitó/Bevétel/Kiadás/Záró) — napi bevétel/kiadás/egyenleg nincs, soronkénti göngyölt egyenleg-oszlop sincs.

**Következmény:** A képernyő nem a hivatalos kasszakönyv logikáját követi: a lelkész nem látja, mennyi a mai kassza-egyenleg, és a napi zárásnál nem tud gyorsan egyeztetni a Monetárral. Egyezik a már felvett 13. teendővel (dátum szerinti rendezés).

#### 🟠 KÖZEPES — Az éves banknapló (Jan–Dec) nem a hivatalos, folyamatos formában készül

**Hivatalos:** Valtozasok_2026.txt: „A banknaplót a kimutatások munkafüzetből csak év végén kell nyomtatni, éves változatban, a lenyílóból a Jan_Dec opciót választva.” A 'Naplo' lapon AA13='Jan - Dec', és ilyenkor N5='=IF(N1=AA13,"TOTAL","TOTAL LUNA")' → EGYETLEN záró TOTAL, folyamatos Nr crt, 40 sor/oldal (P2=40), lapváltásnál U2='Sold pagina precedentă'.

**Kartotéka ma:** reporting.ts:1205-1230 buildFinancePrintDocument: teljes éves módban 12 KÜLÖN havi oldalt fűz össze, mindegyik saját fejléccel, újrainduló sorszámozással és saját „TOTAL LUNA” sorral. Folyamatos éves napló egyetlen TOTAL-lal nincs.

**Következmény:** A banki iratgyűjtőbe lefűzendő éves banknapló formailag eltér attól, amit a számvevő és az egyházkerületi könyvvizsgáló vár (Penzugyi_vizsgalat.txt: „Banknaplót januártól - decemberig egy évben egyszer nyomtatunk”).

#### 🟠 KÖZEPES — A „Simb. cont.” (költségvetési szám) oszlop hiányzik, és a fejléc számozása félrevezető

**Hivatalos:** Kimutatasok 'Naplo' I7='Simb.', I8='cont.' — ez a 9. oszlop; a Document csoport CSAK kettő: C8='Fel', D8='Numar'. Adatok 'Kassza' N4/N5='Költségvetési'/'szám' automatikusan töltődik (N7='=IF(I7&K7<>"",VLOOKUP(I7&K7,fi,2,FALSE),"")').

**Kartotéka ma:** reporting.ts:349-350 megjegyzés: „a 'Simb. cont.' (költségvetési szám) oszlop ELTÁVOLÍTVA a felhasználó kérésére”. A Registru Casa fejléce viszont továbbra is 1..9-ig számoz (reporting.ts:372-374), miközben a 9. oszlop nála a 'Sold zi', a Document alatt pedig 3 aloszlop van (Fel / Nr. ker. / Nr. gyül.) a hivatalos 2 helyett.

**Következmény:** A kinyomtatott lap oszlop-számozása nem a hivatalos ívé; a számvevő a 9-es oszlopban a költségvetési szimbólumot keresi, ott az egyenleg áll. A kód→sor egyeztetés csak a Csoportnaplóval lehetséges.

#### 🟡 KISEBB — Nincs napi kasszakönyvi lap (REGISTRU DE CASĂ, 30 sor/oldal)

**Hivatalos:** Adatok_2026 'Kasszakonyv' D4='REGISTRU DE CASĂ\nKASSZAKÖNYV', oldalanként 30 sor (M2='=ROUNDUP(M1/30,0)'), T1='Sold ziua precedentă - Előző napi egyenleg', T2='Report din pagina precedentă - Áthozat az előző lapról', T3='Total - Összesen', T4='Sold zi - Napi egyenleg', T5='De reportat pagina - Átvitel'.

**Kartotéka ma:** A repóban egyetlen 'REGISTRU DE CASĂ' napi lap sincs — csak a HAVI 'REGISTRU CASA' (reporting.ts:367). A napi zárás fogalma (előző napi egyenleg → napi összesen → napi egyenleg → átvitel) sem a felületen, sem a nyomtatásban nem jelenik meg.

**Következmény:** Nyomtatni nem kötelező (Valtozasok: „A naponkénti kasszakönyvi lapot nem kell kinyomtatni”), de ez a napi önellenőrzés eszköze — a Monetár címletjegyzék ehhez a napi egyenleghez képest mutatna eltérést. Enélkül a hiba csak hónap végén derül ki.

#### 🟡 KISEBB — Nincs 2 tizedesjegyes korlát az összegeken

**Hivatalos:** Adatok_2026 'Kassza' DATA VALIDATIONS: `type=custom f1='IF(ROUND(H6,2)=H6,TRUE,FALSE)' sqref=H6:H4000 J7:J4000`; ugyanez az A–T lapokon (H6:H1000 J7:J1000). Sugo.txt 157. sor: „Ezekbe az oszlopokba csak számok írhatóak, legtöbb két tizedessel.”

**Kartotéka ma:** packages/validations/src/finance/befizetes-save.ts:34-36 `osszeg: z.number().positive()` — nincs tizedes-korlát. Az UI-ban csak `step={0.01}` szerepel (IncomeDialogBody.tsx:232, ExpenseDialogBody.tsx:178), ami böngésző-szintű javaslat, nem érvényesítés (beillesztéssel megkerülhető).

**Következmény:** Egy 12,3456 lejes tétel bekerülhet az adatbázisba. Az Excel-exportnál a hivatalos munkafüzet elutasítja vagy kerekíti, és a Számadás egyenlege fillérekkel elcsúszik — pont az a hibaosztály, amit a Hibak lap keres.

#### 🟡 KISEBB — A „Magyarázat” (felülírható román magyarázat) mező nincs tárolva

**Hivatalos:** 'Kassza' M5='Magyarázat', M7='=IF(I7&K7<>"",VLOOKUP(I7&K7,fif,3,FALSE),"")'. Sugo.txt: „ide kerül automatikusan a költségvetési tétel román neve, ez az oszlop nem védett, felül lehet írni.” A Kasszakönyv D oszlopa EZT írja ki elsőként.

**Kartotéka ma:** A befizetes/kiadas táblákon nincs ilyen oszlop (migration-docs/Database_schema.sql:123-164, :286-325). A román szöveg nyomtatáskor származtatott: reporting.ts:158 `cel?.nevro || cel?.nev` — a lelkész nem tudja tételre szabni.

**Következmény:** Ahol a lelkész az Excelben egyedi román magyarázatot adott (pl. konkrét pályázat vagy szerződés megnevezése), az a Kartotékában nem rögzíthető, és az exportnál elvész.

#### 🟡 KISEBB — A dátum nincs a könyvelési évhez kötve, és nincs időrendi őr

**Hivatalos:** 'Kassza' C1='=DATE(Hibak!$A$1,1,1)', C3='=DATE(Hibak!$A$1,12,31)', C7='=IF(AND(D7<>0,D7>=$C$1,D7<=$C$3),D7,...)' — az éven kívüli dátum nem érvényesül. A D7:D4000 dátum-érvényesítés a $C$2-höz kötött, ami a addigi LEGNAGYOBB dátum ('=IF(MAX(C7:C10000)>C1,MAX(C7:C10000),C1)').

**Kartotéka ma:** befizetes-save.ts:76-79 egyetlen dátum-szabálya: `.refine((d) => d.datum <= today(), { message: 'Jövőbeli dátum nem engedélyezett' })`. Nincs év-határ, nincs időrendi ellenőrzés, és a nem az adott évhez tartozó tétel a felületen egyszerűen láthatatlan (év-választó szűr).

**Következmény:** Egy elgépelt év (pl. 2025 helyett 2026) a tételt NÉMÁN átteszi egy másik évbe: ott a záró egyenleg elromlik, itt hiányzik. Nem hibaüzenet, csak eltűnés — a legnehezebben észrevehető hibafajta.

#### ℹ️ INFÓ — A belső-mozgás párosítás heurisztikus, nem számlapáronkénti (Hibak-mátrix helyett)

**Hivatalos:** 'Hibak' C7:C27 számlánként (kassza + A…T) kereszt-ellenőrzi a ki- és bevezetést, és C30/C33 megmondja, MELYIK irányban hiányzik: „Ha egy jelzés kisebb mint 0: az adott oszlop bankszámlájára nincs bevezetve az az összeg, amit az adott sor számlájáról ki van vezetve”.

**Kartotéka ma:** apps/web/lib/finance/internal-movement-health.ts — a párosítás azonos RON-összeg (devizásnál ±5% tolerancia) + ±7 nap ablak alapján történik (`PAIRING_WINDOW_DAYS = 7`), és csak darabszámot + oldalt jelez (income/expense), nem számlapárt. A jelzés a Kassza/Bank fülön piros ikonként jelenik meg (CashbookTab.tsx:442).

**Következmény:** A hiba TÉNYE látszik, a HELYE nem: ha két azonos összegű mozgás fut egyszerre, a heurisztika rossz párt köthet össze, és a valódi hiány elrejtőzhet. A hivatalos ív számlapárra mutat.

### Ami teljesen hiányzik

- Élő DB-ellenőrzés kell: valóban csak az 5 kanonikus belső-mozgás kód (300.01/301.01/400.01/401.01/402.02) aktív-e, vagy a 300.02–300.20 / 400.02–400.20 családok is bent vannak (a repó SQL-jei nem seedelik őket) — lásd az 1. SQL-t.
- A 'Kassza' D7:D4000 dátum-érvényesítés OPERÁTORA nem szerepel a szöveges kivonatban (csak `type=date f1='$C$2'`). Így nem tudom bizonyítani, hogy az ív TILTJA-e a visszamenőleges dátumot, csak azt, hogy a futó maximumhoz köti.
- Nem ellenőriztem byte-pontosan, hogy a szamadasicel.nev MINDEN kódnál egyezik-e a 2026-os katalógussal — a 2026-06-11g név-fix a 2025-ös listára készült. A SUMIF név szerint aggregál, tehát egyetlen eltérő betű is #N/A-t okoz a hivatalos ívben.
- A Kimutatasok_2026 'Cs' munkalapját (a 110 oszlopos aggregáló motor, amiből a Naplo/Fo_konyv/Csoportnaplo dolgozik) nem bontottam ki — elképzelhető, hogy további ellenőrzéseket tartalmaz.
- Az „A” (nagy gyülekezet) és „B” (kis gyülekezet) változat közti tényleges különbséget a kapott kivonatokból nem tudtam azonosítani (az Adatok_2026 kivonatban nincs változat-kapcsoló), így nem tudom, kell-e a Kartotékának ismernie a változatot.
- A desktop nyomtatási dialógusát (apps/desktop/src/components/finance-print-dialog.tsx) nem néztem át: a web kiszűri a `kiadasi_kiseroiv` típust a listából, a közös buildFinancePrintDocument viszont arra a típusra Registru Casa-t ad vissza (reporting.ts:1187-1190) — ha a desktop nem szűr, ott rossz dokumentumot nyomtatna.
- A bankszámla → hivatalos betűjel (A–T) párosítás csak a desktopon él (getConfirmedLetterForBankName/Id); a webnek és az adatbázisnak nincs ilyen tárolt megfeleltetése, így a webes export nem tudja, melyik banklapra tartozik egy tétel.

> **Megjegyzés:** Semmit nem módosítottam — kizárólag olvasás történt. A hivatalos oldalt az Adatok_2026.txt (Kassza / Kasszakonyv / A–T / Hibak lapok), a Kimutatasok_2026.txt (Naplo lap), a Sugo.txt (125–300. sor), a Valtozasok_2026.txt és a Penzugyi_vizsgalat.txt alapján rögzítettem. A Kartotéka-oldali adatlánc, amit végigkövettem: apps/web/app/(dashboard)/penzugy/page.tsx → apps/web/components/finance/finance-tabs.tsx → apps/web/components/finance/cashbook-tab.tsx / bank-tab.tsx → packages/ui-app/src/finance/CashbookTab.tsx + BankTab.tsx; a nyomtatás packages/ui-app/src/finance/reporting.ts; az export packages/ui-app/src/finance/finance-export.ts; az import apps/web/components/finance/finance-import/helpers/kassza-column-mapping.ts + kassza-sheet-parser.ts; a mentés-validáció packages/validations/src/finance/befizetes-save.ts; a séma migration-docs/Database_schema.sql. KÉT ERŐS PONT, amit érdemes kiemelni: (1) az importáló és az exportáló oszloprendje pontosan a hivatalos D–L fejlécet követi, és az import a nyitó-egyenleg cellát is kiolvassa a fejléc körül; (2) az excel-2026-katalogus.json 927 tétele (packages/core/src/finance/excel/belso-mozgas-nevek.ts forrása) a 2026-os Szamadas lap neveivel egyezik — ellenőriztem a 101.01–101.03 sorokat. A legsúlyosabb kockázat nem hiányzó mező, hanem az, hogy a Kartotékában NINCS havi zárás: a hivatalos rend szerint a kinyomtatott havi kasszakönyv a hónap lezárása, a rendszer viszont utólag is engedi szerkeszteni azokat a sorokat.
