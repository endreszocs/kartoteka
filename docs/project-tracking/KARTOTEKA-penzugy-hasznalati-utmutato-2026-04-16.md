# KARTOTEKA — Pénzügyi modul „Használati útmutató" fül (13. fül)

**Dátum**: 2026-04-16
**Állapot**: tervezés
**Minta**: `components/inventory/inventory-guide-tab.tsx` + `components/inventory/inventory-help-section.tsx` (leltár modulban már élesben fut)
**Kapcsolódó**: `KARTOTEKA-penzugy-fejlesztesi-roadmap-2026-04-16.md`

---

## Célkitűzés

A pénzügyi modul **12 meglévő fülének** használatát egyetlen, lelkész-barát nyelven megírt, **szekcionált útmutatóban** foglaljuk össze, hogy:

- új lelkész pár perc alatt át tudja látni a rendszert,
- konkrét kérdésre (pl. „mi a különbség a belső mozgás és a tranzakció között?") 1 kattintással választ kapjon,
- a rendszer használata „öröm" legyen, ne rejtvényfejtés,
- a jogszabályi figyelmeztetéseket (TVA, e-Factura, amortizáció) **egy helyen** találja meg, hivatkozva a hatályos szabályra.

---

## Szerkezeti alapelv

**Nem helyettesíti**, hanem **mellé áll** az EREK PÉNZÜGYEK fülnek:

| Fül | Szerep | Célcsoport |
|---|---|---|
| **EREK PÉNZÜGYEK** (meglévő) | Egyházi pénzügyi elvek, célkódok (mit hova könyvelj), EREK-szabályrend szerint | Presbiter, gondnok, lelkész elvi eligazításra |
| **Útmutató** (új, 13. fül) | **Szoftver-funkcionális**: hogyan működik minden fül a KARTOTEKA-ban, milyen gombot mikor, milyen figyelmeztetésre figyelni | Mindenki, aki a rendszert használja |

---

## Fül elhelyezkedése

A `components/finance/finance-tabs.tsx` `<ColorTabs>` listájához hozzáadandó **13. elem**:

```
{ value: 'utmutato', label: 'Útmutató', color: 'indigo' }
```

**Sorrend**: `dashboard → cashbook → bank → budget → accounting → transactions → debt → rental → audit → decont → erek → monetary → utmutato`

Az `utmutato` fül **nem igényel adatbázis-függést**, statikus tartalom, a betöltése pillanatszerű. Egyedül a lelkipásztor `congregation_id`-ja kerül átadásra, hogy a kontextus-érzékeny hivatkozások (pl. „a te gyülekezetedben beállított éves járulék: 200 RON") helyesen jelenjenek meg.

---

## Komponens-architektúra

```
components/finance/
├── finance-usage-guide-tab.tsx          ← új wrapper, a fül tartalma
└── usage-guide/
    ├── usage-guide-nav.tsx              ← bal oldali szekció-navigáció
    ├── usage-guide-content.tsx          ← jobb oldali tartalom-panel
    └── sections/
        ├── section-overview.tsx         ← 1. Áttekintés
        ├── section-cashbook.tsx         ← 2. Kassza
        ├── section-bank.tsx             ← 3. Bank
        ├── section-budget.tsx           ← 4. Költségvetés
        ├── section-accounting.tsx       ← 5. Számadás
        ├── section-transactions.tsx     ← 6. Tranzakciók
        ├── section-debt.tsx              ← 7. Tartozások
        ├── section-rental.tsx            ← 8. Bérleti szerződések
        ├── section-audit.tsx             ← 9. Párosítás
        ├── section-decont.tsx            ← 10. Decont
        ├── section-monetary.tsx          ← 11. Monetár
        ├── section-tva.tsx               ← 12. TVA (a figyelő bevezetése után)
        ├── section-efactura.tsx          ← 13. e-Factura (az Oblio bevezetése után)
        ├── section-amortization.tsx      ← 14. Alapeszköz-amortizáció (átvezetés a leltárba)
        └── section-faq.tsx               ← 15. GYIK + gyakori hibák

lib/finance/usage-guide-content.ts       ← szekció-definíciók (cím, leírás, lépések, tippek, figyelmeztetések)
```

**Reuse**: a `lib/inventory/reporting.ts::INVENTORY_GUIDE_SECTIONS` mintáját követjük. Minden szekció ugyanazzal a TypeScript interface-szel (`GuideSection`) íródik.

---

## Szekció-sablon (GuideSection)

```typescript
type GuideSection = {
  id: string                        // URL-friendly, pl. 'kassza'
  title: string                      // "Kassza — készpénzkezelés"
  icon: LucideIcon                   // Wallet, Building2 stb.
  shortDescription: string           // Nav-ban megjelenő sor (1 mondat)
  intro: string                      // Bevezető 2-3 mondat, mi ez és miért
  howItWorks: string[]               // A logika lépésben magyarázva
  steps: string[]                    // Konkrét klikk-sorozat: "1. Kattints a Kassza fülre, 2. ..."
  keyFields: { label: string, desc: string }[]   // Mezők magyarázata
  tips: string[]                     // "Jó tudni" tippek
  caution?: string                    // "Figyelj!" figyelmeztetés
  commonMistakes?: string[]          // Tipikus hibák és hogy kerüljük el
  legalRef?: { title: string, url?: string }[]  // Jogszabályi hivatkozás (ha van)
  relatedSections?: string[]         // Linkelt szekció-id-k
}
```

---

## Szekció-tartalomterv

### 1. „Áttekintés — hogyan kezdj neki?"
- Bevezető: a pénzügyi modul 12 + 1 füles szerkezete, melyik mire való
- „Első lépések új évben": bank/kassza nyitó egyenleg beállítása → költségvetés feltöltése → első bevétel/kiadás
- „Napi rutin": mi az a min. 3 dolog, amit napközben csinálni kell
- Tipikus kérdés: „hol kezdjem, ha ma vettem át a gyülekezet pénzügyeit?"
- **Link**: az egyes szekcióknak

### 2. „Kassza — készpénzkezelés"
- Mi a kassza, miben különbözik a banktól: **fizikailag a lelkésznél / pénztárban lévő készpénz**
- Hogyan rögzíts készpénzes bevételt (persely, járulék, adomány készpénzben)
- Hogyan rögzíts készpénzes kiadást (nyugta, átvevő megadása)
- **Nyugtafigyelő** — a rendszer automatikusan figyeli a hiányzó, ismétlődő, vagy kronológiailag hibás nyugtaszámokat. Mit jelent, mit csinálj, ha riasztást ad.
- Kapcsolat a **Monetár** fülhöz: hogyan egyeztesd a fizikai készpénzt a könyvelt egyenleggel
- **Gyakori hiba**: a kasszában lévő pénz és a rendszerben látott egyenleg nem stimmel — **mit tegyél?**

### 3. „Bank — bankszámlák és tranzakciók"
- Mi a bankszámla modul: egy vagy több bankszámla a gyülekezet nevén
- Hogyan adj hozzá új bankszámlát (IBAN, devizanem, nyitó egyenleg)
- **Devizás számlák** kezelése: EUR, HUF, USD — a rendszer BNR-árfolyammal átértékeli évvégén
- **FX átértékelés (valuta_atert)**: mit jelent, mikor fut, miért fontos (évvégi zárás)
- Belső mozgás **kassza ↔ bank** — **NE** könyveld kétszer (egyszer kiadás, egyszer bevétel), hanem a **Speciális mozgás** gombbal
- Közelgő fejlesztés: **bankkivonat CSV import** (amikor kész)

### 4. „Költségvetés — éves terv készítése"
- Mi a költségvetés: a következő év **tervezett** bevételei és kiadásai célkódonként
- Mikor kell elkészíteni: a presbitérium által januárban
- Hogyan rögzítsd: `budget` fülön, célkódonként beírod a várt összeget
- **Költségvetés véglegesítése** (`budget_finalized`): presbiteri határozat után lezárható, és minden gyülekezeti tag a jóváhagyott számot látja
- **Módosítás év közben**: csak **presbiteri határozat** alapján, ha szükséges → `osszeg_modositott` mező
- Kapcsolat a **Számadás** fülhöz: a számadás azt mutatja, hol tartunk a tervhez képest

### 5. „Számadás — tervezett vs. tényleges"
- Mi a számadás: a **tényleges** teljesítés és a tervezett költségvetés különbsége
- Hogyan olvasd: minden célkódnál látod a `tervezett / tényleges / százalék / különbség`-et
- Év végi **véglegesítés** (`accounting_finalized`): presbiteri határozat + iktatószám szükséges
- **Unlock flow** (feloldás): ha utólag hibát találsz, a felettes admin engedélye szükséges
- **Résszámadás** (tervezett funkció): időközi kimutatás pl. félévre

### 6. „Tranzakciók — minden tétel egy helyen"
- Mi a Tranzakciók fül: minden bevétel és kiadás **egy listában**, szűrhetően
- Hogyan szűrj: dátumra, célkódra, személyre, összegre, bankszámlára
- Export és nyomtatás
- Tétel szerkesztése / törlése: **soft delete** (nem vész el, naplózva van)

### 7. „Tartozások — ki tartozik még a járulékkal?"
- Mi a tartozás: egy tag, család, vagy bérlő **még be nem fizetett** összege
- Járulék tartozás: ki mennyivel tartozik (70 év feletti felmentés, diák kedvezmény automatikusan figyelembe véve)
- Bérleti tartozás: szerződésből származó esedékesség, amit még nem fizettek
- **Tartozás-számítási mód**: aktuális évi vs. akkori évi besorolás (konfigurálható)
- **Fizetési határidő** beállítása (`jarulek_hatarid`, alapértelmezett 07-01)

### 8. „Bérleti szerződések — terület, épület, terem"
- Mi a bérleti modul: szerződés-nyilvántartás (bérlő, tárgy, összeg, időszak)
- Szerződés típusa: **terület** vagy **épület** (jelenleg) — bővítendő: `comodat` vs. `locațiune` (→ TVA figyelő)
- Ki a bérlő: magánszemély (`id_szemely`) vagy cég (`ceg_nev`, `ceg_adoszam`)
- Fizetési ciklus: **havi** vagy **éves**
- Kapcsolat a **Tartozások** és a **Bevétel** fülhöz
- Közelgő fejlesztés: **Oblio e-Factura kiállítás** egy kattintással

### 9. „Párosítás — személyhez, családhoz kötés"
- Mi a párosítás: a beérkezett befizetéseket hozzárendeljük konkrét személyhez vagy családhoz
- Miért fontos: a tartozásszámításhoz és az éves tagi kimutatáshoz szükséges
- **Párosítatlan tétel** mit jelent, mikor fordulhat elő (pl. anonim adomány)
- Automata segítség: a rendszer **név vagy CNP alapján** javaslatot ad

### 10. „Decont — elszámolás"
- Mi a decont: időszakos pénzügyi elszámolás egyházmegye felé
- (Ide részletesen az aktuális decont-workflow alapján — külön egyeztetést igényel)

### 11. „Monetár — címletezés és készpénz-ellenőrzés"
- Mi a monetár: **fizikai** készpénzállomány címletenként (200 lej, 100 lej, 50 lej… 0.01 lej)
- Miért kell: a könyvelt kasszaegyenleg és a fizikai pénztárban lévő összeg egyezése
- Hogyan végezd: rendszeresen havonta legalább egyszer, és presbiteri ellenőrzéskor
- **Eltérés kezelés**: hiány vagy többlet esetén mit tenni (jegyzőkönyvezés)

### 12. „TVA — forgalmi plafon figyelés" (a TVA figyelő bevezetése után)
- Mi a TVA (ÁFA): román hozzáadottérték-adó
- **Mikor érint a gyülekezetet**: ha a **gazdasági tevékenységből** (bérleti díj, temetői díj, könyveladás) származó **éves forgalom** meghaladja a **395 000 RON-t**
- **Mi NEM gazdasági tevékenység**: adomány, persely, járulék, szertartási díj (szoros kapcsolat a vallási tevékenységgel) — **NEM számít a plafonba**
- **Comodat vs. locațiune**: ha ingyenes használatba adsz → **nem számít**; ha bérleti díjért → **számít** (még ha az ÁFA-mentes is)
- **Mit figyelj a rendszerben**: sárga, narancs, piros jelzés 80% / 90% / 100% küszöbön
- Túllépés esetén: **10 napon belül a könyvelő benyújtja a 010-es nyomtatványt az ANAF-nak**
- **Jogszabályi hivatkozás**: Codul fiscal art. 292 alin. (1) lit. k) (cult mentesség), art. 292 alin. (2) lit. e) (ingatlan bérlés), art. 310 (kis vállalkozás plafon) — OG nr. 22/2025
- **Figyelem**: ez nem jogi tanácsadás, a regisztrációs eljárást a könyvelő intézi

### 13. „e-Factura — elektronikus számla (Oblio)" (az Oblio bevezetése után)
- Mi az e-Factura: ANAF SPV-n keresztül küldött elektronikus számla
- **Mikor kötelező**: 2025. július 1 óta **minden ONG és vallási kultus** köteles, ha **gazdasági tevékenységet** végez (bérleti díj = gazdasági)
- **Mit csinál a KARTOTEKA**: Oblio API-n keresztül kiállítja a számlát, ami automatikusan felmegy az ANAF-hoz
- Első beállítás: **Oblio fiók regisztráció** → API-kulcs megadása a gyülekezeti beállításokban
- **Számla kiállítása**: a bérleti szerződésből egy kattintás → Oblio szám + PDF + SPV státusz
- **Tárolt adat** a KARTOTEKA-ban: számla ID, Oblio URL, SPV státusz (pending / accepted / rejected)
- Jogszabályi hivatkozás: OUG 120/2021 (módosítva)

### 14. „Amortizáció — alapeszközök értékcsökkenése"
- **Hol található**: nem a Pénzügyben, hanem a **Leltár** modulban, tételszintű „Amortizáció" gombbal
- Mi az amortizáció: egy nagy értékű eszköz (kazán, orgona-felújítás, számítógép, autó) értéke **évek alatt oszlik el** a könyvelésben
- **Mikor alapeszköz**: **legalább 2500 RON** beszerzési érték és **legalább 1 év** használati idő
- **Alatta**: „csekély értékű" tárgy, azonnal költség
- Hogyan számít a rendszer: **lineáris havi leírás** — `beszerzési érték / (használati idő év × 12)`
- **Katalóguskód** (HG 2139/2004): mit jelent, miért fontos (a hasznos élettartam ebből jön)
- Gyakorlati haszon: év végén látod az egész eszközpark **aktuális értékét** → éves jelentésbe és leltárba kerül
- Mit kell rögzíteni: **beszerzési érték**, **beszerzés dátuma** (de jobb: **üzembe helyezés dátuma**), **használati idő év**, **katalóguskód**
- **Link**: közvetlen hivatkozás a Leltár modulba

### 15. „GYIK — Gyakran Ismételt Kérdések"
- „Elrontottam egy bevételt, hogyan javítsam?"
- „A kasszában kevesebb pénz van, mint amit a rendszer mutat"
- „Nem engedi lezárni a költségvetést"
- „Nem jön át az éves jelentésbe a pénzügyi adat"
- „Devizás bankszámlámhoz nem találok árfolyamot"
- „Miért nem látom a bérleti tartozást a tartozások fülön?"
- „Hogyan tudok visszaállítani egy töröltnek hitt tételt?"
- „Miből áll össze a gyülekezeti járulék felső határa?"
- (A fejlesztés során tapasztaltak alapján bővítjük)

---

## UI és stílus

### Design (modal-design-system memória szerint)
- **Bal oldali navigáció**: szekciók listája, aktív kiemelve (teal-400 border + teal-50 bg — mint a leltár modulban)
- **Jobb oldali tartalom**: szekció-cím (serif `font-heading`), bevezető, szekcionált blokkok
- **Kártya stílus**: `rounded-[28px] border border-slate-200 bg-white p-5 sm:p-6 shadow-sm`
- **Tippek** blokk: `bg-emerald-50/70 border-emerald-200` + `Lightbulb` ikon
- **Figyelmeztetés** (caution): `bg-amber-50 border-amber-200` + `AlertTriangle` ikon
- **Jogszabályi hivatkozás**: `bg-slate-50 border-slate-200` + `Scale` ikon, kisebb betű, link kiemelve
- **Mobile-first**: telefonon egy oszlopban (lenyíló nav), tableten/desktopon két oszlopban

### Keresés
A fül tetején egy keresőmező: **„Mit szeretnél megtudni?"** — minden szekció címét, bevezetőjét és kulcsmezőit átfogó fuzzy keresés (kliens oldalon, nincs szerver-hívás). Az eredmények oldalra scrollolnak és kiemelik a találatot.

### Nyomtatás
A **teljes útmutató egyben kinyomtatható** (PDF export gomb), hogy a lelkészek referenciaként dokumentumként is elmenthessék. Használja a `html2pdf.js`-t (már dependency).

---

## Fejlesztési ütemterv

### A. Elkészítés sorrendje
1. **Keretrendszer létrehozása** (wrapper, nav, content-renderer, type-k) — kb. 1 komponens-fájl cserébe
2. **Szekciók 1-11** (a már meglévő funkciókra) — szekciónként 1-1 fájl, tartalom beírása
3. **Szekció 14** (amortizáció, mert nem igényel új fejlesztést, csak magyarázatot)
4. **Szekció 15** (GYIK) — minimál kezdettel
5. **Fül integráció** a `finance-tabs.tsx`-be
6. **Keresés** hozzáadása
7. **Nyomtatás** hozzáadása
8. **Szekció 12 (TVA)** és **13 (e-Factura)** — a két kapcsolódó munkacsomag befejezése után frissítendő

### B. Nem része az első körnek
- Videós magyarázat (jövőbeli megfontolandó)
- AI-segéd chat az útmutatóban (már van `ai-chat-widget` a rendszerben, később integrálható)
- Többnyelvű (román/magyar) tartalom — egyelőre magyar

---

## Tartalom-szerkesztés policy

Minden szekció tartalmát a rendszer **karbantartójával** (felhasználó) közösen véglegesítjük:
- **Pasztorális hangnem**: barátságos, emberközeli, nem technikai. A memóriában rögzített `feedback_ux_philosophy.md` elvét követi.
- **Rövid mondatok**, konkrét példák a gyülekezeti életből.
- **Jogi pontosság**: ahol jogszabályt említünk, azt **pontosan** és hivatkozással, és mindig jelezzük, hogy ez **nem ügyvédi/könyvelői tanácsadás**, a részletkérdésekben a könyvelőhöz kell fordulni.

---

## Kockázatok

1. **Tartalmi karbantartás** — ha a funkciók változnak, az útmutató elavulhat. **Policy**: minden új funkciónál a PR tartalmazza az útmutató szekció frissítését is (`docs/project-tracking/KARTOTEKA-*` fájl + útmutató szekció).
2. **Túl hosszú tartalom** — ha minden szekció 3000 szó, senki nem olvassa. **Irányelv**: szekciónként max. 600 szó törzstartalom + tippek/figyelmeztetések kívül. A mély merülést külön `docs/user-guide/` hivatkozásokkal oldjuk meg.
3. **Keresés pontossága** — kliens oldali fuzzy keresés sok szekciónál lassú lehet. Ha a szekciók száma 20+, érdemes **lunr.js** vagy hasonló indexre váltani. Most kezdeti fázisban egyszerű `includes` szűrés elég.

---

## Nyitott kérdések

1. Az útmutató tartalmát **mi** írjuk be, vagy **megbízol** benne egy első vázlattal, amit átnézel? (Az első vázlatot én el tudom készíteni a jelenlegi kód és a memóriám alapján, utána te finomítasz.)
2. A Használati útmutató **minden lelkésznek látszik**, vagy csak a **`lelkesz` szerepkörnek**? (Javaslatom: mindenkinek, mert a gondnok és a pénzügyi felelős is használja.)
3. A **decont szekció** tartalma — ez egy egyházmegyei specifikus folyamat, itt szükségem lenne rövid leírásra tőled (pár mondat: mi a decont, mikor kell, milyen adatokat kell leadni), hogy pontosan tudjak írni róla.
4. **PDF nyomtatáskor** a hivatalos fejléc (gyülekezet neve, dátum) szerepeljen, vagy legyen „semleges" kézikönyv?
