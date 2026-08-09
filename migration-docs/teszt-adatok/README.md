# Teszt-adatok — importfájlok és SQL-ek a Teszt gyülekezethez

Ez a mappa a **Teszt gyülekezet** (`7e570000-0000-4000-8000-000000000003`)
biztonságos demózásához készült. Minden adat **teljesen kitalált** — a
vezetéknevek szándékosan nem létező magyar nevek (Példabeszédi, Tesztfalvi,
Mintakerti…), a telefonszámok `0799 000 xxx` álszámok, így a
kereszt-gyülekezeti egyezés-figyelő (cross-match trigger) nem ad
téves riasztást más gyülekezetek valódi tagjaira.

---

## 1. SQL-fájlok (Supabase SQL Editor, kézi futtatás)

Helyük: `migration-docs/sql/`. **Futtatási sorrend:**

| # | Fájl | Mit csinál |
|---|------|-----------|
| 1 | `2026-08-09-teszt-gyulekezet-ellenorzes.sql` | **Csak olvas.** Megmutatja, mi van most a Teszt gyülekezetben (sor-darabszámok táblánként, mintasorok, pénzügyi összesítők, feloldatlan cross-match értesítések). Szakaszonként futtasd — a SQL Editor csak az utolsó SELECT eredményét mutatja. |
| 2 | `2026-08-09-teszt-gyulekezet-wipe.sql` | **Kiürítés.** Töröl minden adatot (a klónozott Barátosi-adatokat is), de a gyülekezet, az egyházmegye/kerület és a profil-hozzárendelések megmaradnak. Egy tranzakció, újrafuttatható. |
| 3 | `2026-08-09-teszt-gyulekezet-seed.sql` | **Fiktív feltöltés.** 48 személy / 15 család (régi `csalad`+`gyerek` ÉS az új `haztartas`-modell is), 2025+2026 év-beállítások, ~74 befizetés, ~32 kiadás, bankszámla, leltár, munkanapló, programok, pár anyakönyvi tétel. Csak ÜRES gyülekezetre fut le (különben szól és kilép) — előtte mindig wipe. |

Fontos a seedhez: a `befizetes.userid`-hez kell egy profil. Ha a Teszt
gyülekezethez még senki nincs hozzárendelve, futtasd előbb a
`2026-07-01-teszt-egyhazkozseg-seed.sql` **BLOCK 2**-jét egy valódi,
regisztrált email-címmel.

Beépített demo-helyzetek a seedben:

- **Hátralékosok:** a 9., 11., 12., 14., 15. család 2026-ra nem fizetett →
  a Pénzügy → Tartozások fül azonnal mutat adatot.
- **Családi befizetés:** a 3. (Mintakerti) és 4. (Próbavári) család egyetlen
  családi sorral fizette 2026-ot (240 RON) → családi felosztás demó.
- **Felmentés:** Példavári Sándor (11. család) felmentett → nem tartozik.
- **Kor-kedvezmény:** 2026-ban 70 év felett 50% levonandó kedvezmény.
- **Elhunyt tag:** Példakerti Vilmos (†2026-02-10) + temetési anyakönyv.
- **Elköltözött tag:** Mintavölgyi Csenge (2025-09, külföld) + anyakönyvi tétel.
- **Friss házasok:** Példásfalvi Szabolcs + Orsolya (esketés 2026-05-16).

---

## 2. Importfájlok — melyik fájl melyik importálóba való?

Minden fájlt a tényleges parser-kód alapján generáltunk, és a beolvasó
logika replikájával visszaellenőriztünk (fejléc-felismerés, kötelező
oszlopok, egyenleg-beolvasás) — mind a 37 ellenőrzés zöld.

### Hozzáférés — jó tudni

A modulokon belüli **„Rendszergazdai importáló" fülek** (Tagnyilvántartás,
Pénzügy, Iktató, Leltár) csak akkor látszanak, ha:

- **god mode** aktív (master fiók), VAGY
- **delegált import**: bármely bejelentkezett felhasználó a gépen megnyithat
  egy 2 órás import-munkamenetet a **6 jegyű rendszergazdai PIN**-nel
  (a fülön lévő PIN-dialógus; modulonként külön kell feloldani).

Kivétel: a **BCR bankkivonat-import** sima lelkészi funkció (Pénzügy → Bank
fül → import), nem kell hozzá PIN.

### 2.1 `szemelyek-teszt-import.xlsx` → Tagnyilvántartás

- **Hová:** Tagnyilvántartás → Rendszergazdai importáló → fájl feltöltése,
  mód: „Új személyek".
- **Formátum:** 1 fül (`Személyek`), fejléc az 1. sorban a `PROFILE_PERSONS`
  oszlopaival. A fájlnévben a „szemely" szó miatt a varázsló automatikusan a
  Személyek-profilt választja. Csak a `Családnév` + `Keresztnév` kötelező.
- **Tartalom:** 8 új fiktív személy + **2 SZÁNDÉKOS DUPLUM** (lásd lent).
- **Várt eredmény:** a Helységek lépésben a „Tesztfalva" szöveges helységet
  hozzá kell rendelni egy valódi katalógus-településhez (vagy újként
  felvenni); utána 9 sor beszúrva, 1 sor kihagyva.

**A 2 szándékos duplum:**

1. **Sablonszegi Károly** — ugyanazzal a CNP-vel (`EC-TSZT-05F`), mint a
   seedelt tag → az import ezt a sort **kihagyja** (duplikált-CNP védelem
   demója). Várt üzenet: 1 kihagyott sor.
2. **Mintakerti Emese** — CNP nélkül, de a seedelt taggal azonos név +
   születési dátum → az import **beengedi**, gyülekezeten belüli névazonos
   duplum keletkezik. Ez azt demonstrálja, hogy a kereszt-gyülekezeti
   figyelmeztetés csak MÁSIK gyülekezetbeli egyezésre szól (a saját
   gyülekezetet a trigger kizárja). A duplum teszt után kézzel törölhető.

### 2.2 `csaladok-teszt-import.xlsx` → Tagnyilvántartás (családfők)

- **Hová:** ugyanaz a varázsló; a fájlnévben a „csalad" szó miatt automatikusan
  a „Családfők és családok" profilt ajánlja (megerősítő kérdés jöhet).
- **Formátum:** 1 fül (`Családok`); kötelező: `Családnév`, `Keresztnév`,
  `Utca`, `Házszám`. A születési dátum az `Év`/`Hó`/`Nap` oszlopokból áll össze.
- **Tartalom:** 3 új családfő (Kartonfalvi Elek, Demóvölgyi Irma, Próbaszegi
  Lajos) → soronként 1 új személy + 1 új család jön létre atomikusan
  (`import_family_head_batch` RPC + háztartás-szinkron).

### 2.3 `Adatok_2025_teszt.xlsx` → Pénzügy (Kassza-varázsló)

- **Hová:** Pénzügy → Rendszergazdai importáló → Kassza-munkafüzet varázsló.
  (Szerveroldalon master/admin/kerületi admin/könyvelő szerep is kell.)
- **Formátum:** a hivatalos EREK-évkönyv elrendezésének replikája:
  - `Kassza` nevű fül (kötelező!) + `A` nevű bank-fül (a bank-lapok neve
    egyetlen betű A–F);
  - tájékoztató sorok, köztük `Egyenleg:` = év végi **záró** (2456,50 ill.
    5120), a fejléc alatt `Előző évi (készpénz)egyenleg:` = **nyitó**
    (850 ill. 4200) — a varázsló mindkettőt beolvassa;
  - a valódi fejléc-sor: `Dátum | Iratszám | Irattip. | Név | Bev. - Összeg |
    Bevétel - Költ.vet. név | Kiad. - Összeg | Kiadás - költ.vet. név |
    Megjegyzés | Magyarázat | Költségvetési szám`.
- **Tartalom:** 10 kassza-sor (járulék `101.01`, persely, adomány, villany
  `205.01`, irodaszer `201.12`, valamint 1 belső mozgás `400.01` —
  készpénzletétel, aminek a bank-fülön ott a párja) + 4 bank-sor.
- **Várt eredmény:** a varázsló felismeri az oszlopokat, a `400.01`-es sort
  belső mozgásnak sorolja be, az `A` fület hozzá kell rendelni a seedelt
  „Teszt Bank" bankszámlához. A nem-`101.01` kódú kategóriákat az
  ellenőrző lépésben kézzel is lehet pontosítani, ha a katalógus máshogy
  nevezi őket.
- FIGYELEM: a seed már 2025-ös nyugta-sorszámokat használ (1..N) — ha a
  seed UTÁN importálod ezt a fájlt, a datum-év tengelyen ütköző
  nyugtaszámokra a dedup/figyelő jelezhet. Tiszta teszthez: wipe → seed
  NÉLKÜL vagy wipe → import → seed helyett külön-külön próbáld.

### 2.4 `bcr-bank-kivonat-teszt.xlsx` → Pénzügy (Bank fül, lelkészi)

- **Hová:** Pénzügy → Bank fül → BCR-import gomb. **Nem kell PIN** — sima
  lelkészi funkció.
- **Formátum:** első munkalap; fejléc: `Data inregistrarii | Descrierea
  tranzactiei | Referinta tranzactiei | Nume partener | Suma iesire |
  Suma intrare | Sold`. A dátumok ISO alakban (nem kétértelműek).
- **Tartalom:** 6 tranzakció 2026-ból — 3 jóváírás (adomány/járulék),
  2 terhelés (villany, bankköltség), 1 készpénzfelvétel (belső mozgásnak
  jelölhető a varázslóban).
- **Várt eredmény:** mind a 6 sor beolvasva; soronként te döntesz
  (bevétel / kiadás / belső mozgás / kihagyás + kategória).

### 2.5 `iktato-teszt-import.xlsx` → Iktató

- **Hová:** Iktató → Rendszergazdai importáló (PIN/god mode) → fájl
  feltöltése. A fül neve `Iktato`, ezért a profil automatikusan
  hozzárendelődik.
- **Formátum:** `PROFILE_FILING` fejlécek; az EGYETLEN kötelező oszlop az
  `Erkezes/kuldes datuma`. Az `Irány` értékei `incoming` / `outgoing`.
- **Tartalom:** 6 irat 2026-ból (körlevél, felterjesztés, önkormányzati
  levelezés, meghívó, kérelem); az utolsó sor iktatószám nélkül —
  automatikus sorszámot kap, és az import után a rendszer a
  sorszám-mutatót is szinkronizálja.
- Jó tudni: a `Kuldo keltezese` és a `Hivatkozas cime` oszlopokat a parser
  beolvassa, de a jelenlegi kód NEM menti el (ismert hiányosság) — a
  fontos adatok a többi oszlopban legyenek.

### 2.6 Leltár — NINCS működő import (szándékosan nincs fájl)

A Leltár „Rendszergazdai importáló" füle jelenleg **csak előkészítő
felület**: fájlt ki lehet választani, de a rendszer nem dolgozza fel
(nincs leltár-importprofil; az admin import-hub is „hamarosan"-ként
listázza). Ezért ehhez a modulhoz **nem készült importfájl** — leltári
tételt a felületen kézzel (vagy a kiadás→leltár híddal) lehet rögzíteni.
A seed-SQL 6 fiktív leltári tételt így is létrehoz.

### Egyéb pénzügyi importálók (nem készült hozzájuk fájl)

- **Egyházfenntartás kettős-fájlos varázsló** (Adatok_YYYY.xlsx + bevételek
  YYYY.xml): pozíció-alapú, szigorú formátum — a fenti Kassza-fájl fedi le
  ugyanazt a demót egyszerűbben.
- **Általános bevétel-varázsló:** tetszőleges fejlécű táblát fogad kézi
  oszlop-párosítással — bármelyik fenti xlsx jó hozzá.

---

## 3. Generálás / újragenerálás

A fájlokat Node-szkript állította elő és validálta (a parserek logikájának
replikájával). A szkript a munkamappán kívül, ideiglenes könyvtárban él;
újrageneráláshoz elég bármely xlsx-t a fenti formátum-leírás szerint
szerkeszteni — a lényeg a fejléc-sorok pontos megtartása.
