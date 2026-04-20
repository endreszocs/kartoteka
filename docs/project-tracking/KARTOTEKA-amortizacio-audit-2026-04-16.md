# KARTOTEKA — Amortizáció audit és lelkész-barát finomhangolás

**Dátum**: 2026-04-16
**Állapot**: audit kész, fejlesztés tervezés alatt
**Érintett fájlok**: `components/inventory/inventory-amortization-dialog.tsx`, `lib/constants/inventory.next.ts`, `lib/inventory/reporting.ts`, `components/inventory/inventory-main-v3.tsx`
**Kapcsolódó**: `KARTOTEKA-penzugy-fejlesztesi-roadmap-2026-04-16.md`

---

## Vezetői összefoglaló

A rendszerben **működik** a tárgyi eszköz (alapeszköz) amortizáció, **lineáris havi módszerrel**, a `leltar_tetelek` tábla `beszerzes_erteke` + `hasznalati_ido` + `beszerzes_datuma` mezőire építve. A számítási képlet **jogilag helyes**, de a megvalósítás **3 kritikus ponton** hiányos, és a **lelkészek számára a mostani magyarázó szöveg nem elegendő**.

**Felhasználói döntés (2026-04-16)**: a katalógus **marad 10 tételes + „egyéb"** opció. Ez egyszerűsíti a munkát, a fókusz a **UX-en és a jogszabályi pontosításon** lesz.

---

## Állapotaudit — mit tud a rendszer ma?

### ✅ Működő elemek

| Funkció | Fájl | Megjegyzés |
|---|---|---|
| Lineáris havi értékcsökkenés | `inventory-amortization-dialog.tsx:29-33` és `lib/inventory/reporting.ts:240-257` | `beszerzés / (év × 12)` képlet |
| Csak `alapeszkoz` kategóriára fut | `lib/inventory/reporting.ts:241` | Helyes — csekélyérték, könyv, kegyszer nem amortizál |
| Katalóguskód (HG 2139/2004) | `lib/constants/inventory.next.ts:158-169` | 10 tétel rögzítve |
| Magyarázó blokk a dialogban | `inventory-amortization-dialog.tsx:140-148` | 4 rövid bullet |
| Teljes értékcsökkenés felső korlátja | `inventory-amortization-dialog.tsx:31` | `Math.min(purchaseValue, ...)` — nem megy mínuszba |
| Leltár-listában aktuális érték | `lib/inventory/reporting.ts::calculateInventoryCurrentValue` | A leltár-összesítőben figyelembe veszi |

### ❌ Hiányzó / hibás elemek

#### 1. **Nincs aktiválási minimum-ellenőrzés**

A román szabályrendszer (Codul fiscal art. 28 alin. (4); HG 276/2013 és módosítások) szerint **2500 RON alatti** beszerzési érték esetén a tétel **nem alapeszköz**, hanem **csekély értékű tárgy** (obiecte de inventar), és **nem amortizálható** — egy tételben költségesíthető.

**Ma a rendszer ezt nem ellenőrzi**: egy lelkész felvehet egy 800 RON-os széket alapeszközként, és a rendszer 4 évre szét fogja amortizálni. Ez **rossz könyvelői kimenet**, és a számadásban is torzít.

**Javasolt**: új tétel rögzítésekor, ha `kategoria_key === 'alapeszkoz'` és `beszerzes_erteke < 2500` → **figyelmeztetés**, amely elmagyarázza: „Ez a tétel az alapeszköz küszöbértéke (2500 RON) alatt van. Könyvelői szempontból inkább csekély értékű tárgyként kellene rögzíteni. Biztos vagy benne, hogy alapeszközként folytatjuk?"

A küszöb **konfigurálható** konstans legyen (`ALAPESZKOZ_MIN_ERTEK_RON = 2500`), mert a jogszabály ritkán, de változhat.

#### 2. **Nincs „beszerzés" és „üzembe helyezés" dátum különbség**

Jogszabály szerint az amortizáció **az üzembe helyezés hónapjától** indul, **nem** a vásárlás dátumától. Egy gyülekezet decemberben kifizethet egy kazánt, de januárban helyezik üzembe.

**Ma**: egyetlen `beszerzes_datuma` mező van, abból számolja az eltelt hónapokat.

**Javasolt**:
- Új opcionális mező a `leltar_tetelek` táblában: `uzembe_helyezes_datuma date` (nullable)
- Ha megadva → az amortizáció számítás ebből indul
- Ha nincs megadva → visszaesik a `beszerzes_datuma`-ra (backward compatible)
- A dialogban egyértelmű magyarázat: „Ha nem vagy biztos, hagyhatod üresen — a rendszer a beszerzés dátumát fogja használni."

#### 3. **Nincs maradványérték (valoare reziduală) beállítás**

Jogszabály szerint lehetséges (nem kötelező), hogy a lelkész **nem vezeti le nullára** az eszközt, hanem egy maradványérték marad (pl. gépjárműnél 10%). A könyvelőtől kapott útmutatás szerinti érték.

**Ma**: a rendszer mindig nullára fut le.

**Javasolt**: opcionális `maradvany_ertek_ron numeric default 0` mező. Ha 0 (alapértelmezett), úgy működik, mint most. Ha nagyobb, a számítás:
```
havi_lei­rás = (beszerzési_érték - maradványérték) / (használati_idő × 12)
```

Ez a **P2 prioritású** változtatás — **csak ha a lelkészek kérik**, nem elsőrendű.

#### 4. **Nincs rendkívüli kivezetés (selejt, lopás, ajándékozás)**

Ma csak `torles_datuma` van a leltári tételre — nem derül ki **miért** vezetődött ki.

**Javasolt**: opcionális `kivezetes_indoka` enum mező: `selejtezes`, `lopas`, `adomanyozas`, `eladas`, `egyeb`. Az amortizáció számításra nincs hatással, de a **leltári jelentésben és az éves jelentésben** fontos szerepű.

Ez is **P2** — nem a fő irány.

#### 5. **Lelkészi magyarázó szöveg hiányos**

A dialogban (`inventory-amortization-dialog.tsx:140-148`) mindössze **4 bullet** magyaráz. Egy lelkész, aki először látja, **nem fog tőle eligazodni**. A felhasználó kifejezetten kérte, hogy „a lelkészek nem értenek hozzá" — ezt kell megoldani.

**Javasolt** (új blokk a dialogban és az Útmutató fülben):

```
Mi az amortizáció és miért kell nekünk?

Egy nagyobb értékű eszköz (templomi kazán, orgona-felújítás, számítógép, autó) 
nem egy nap alatt használódik el. A könyvelés ezért az eszköz értékét 
több évre elosztja — minden évben egy kis darab „fogyasztódik el" belőle.

Gyakorlatban ez neked mit jelent?

• Amikor veszel egy 12 000 RON-os kazánt, az NEM egy 12 000 RON-os kiadás abban a hónapban. 
  A rendszer 10 évre bontja → évente 1 200 RON, havonta 100 RON.
• Év végén a leltárban látod az eszköz „aktuális értékét" — ezt küldöd tovább az éves jelentésbe.
• Ha az eszköz teljesen lefutott, értéke 0 — de fizikailag még megvan, csak már nem vagyon.

Mire kell figyelned:

• A beszerzési érték NEMCSAK az ár, hanem a szállítás, beszerelés, próbaüzem is — minden, amit 
  ahhoz fizettél, hogy működjön.
• Ha ugyanabból 3 darabot vettél (pl. 3 szék), a mennyiség mezőt használd, ne 3 külön tételt.
• A katalóguskód segít abban, hogy a rendszer megajánlja a helyes használati időt. Ha bizonytalan
  vagy, válaszd a „Nincs megadva" opciót és kérdezd meg a könyvelőt.

Ha csak egy 800 lejes ruhatartó van:

• Ez a RO törvény szerint 2500 lej alatti tétel, tehát NEM alapeszköz, hanem „csekély értékű tárgy".
• A rendszer figyelmeztetni fog — válaszd a „Csekély értékű" kategóriát inkább.
```

#### 6. **Katalóguskódok pontosítása**

A jelenlegi 10 tétel jó kezdet, de néhány **hiányzó, gyakori** eszköz:

| Eszköz | Javasolt kód | min-max év |
|---|---|---|
| Orgona (új vagy felújítás) | `3.1.7` | 30-50, def 40 |
| Harang (új öntés) | `1.6.2` (épülethez tartozó) | 40-60, def 50 |
| Hangtechnika (mixer, hangszórók) | `2.1.23.2` | 4-6, def 5 |
| Videótechnika (projector, kamera) | `2.2.9` (vagy új kód) | 3-5, def 4 |
| Klíma berendezés | `2.1.17.1` | 8-12, def 10 |
| Mosógép, mosogatógép (közösségi) | `2.1.24.1` | 6-10, def 8 |
| Elektromos fűnyíró, gyepgondozó | `2.5.8` | 5-8, def 6 |
| Riasztórendszer, kamera-rendszer | `2.2.5` | 6-8, def 7 |

Ezeket egy következő körben hozzáadjuk — a felhasználói döntés szerint most a fókusz nem itt van, de érdemes a listát kiegészíteni, ha a katalógus érintetté válik.

**Fontos**: a kódok a **HG 2139/2004 tartalmára hivatkozva** kerüljenek — nem találhatunk ki saját kódokat, mert az adatmegosztás és a könyvelői kompatibilitás elromlik.

---

## Javasolt fejlesztési lépések (prioritás szerint)

### P0 — Mielőbb

1. **Aktiválási minimum figyelmeztetés** (2500 RON alatt)
   - Új konstans `lib/constants/inventory.next.ts`-ben
   - Új ellenőrzés az új tétel rögzítés modal-ban
   - Nem blokkoló, csak figyelmeztető — a lelkész dönt

2. **Lelkészi magyarázó blokk** az `inventory-amortization-dialog.tsx`-ben
   - A „Mit jelentenek ezek az adatok?" kibővítése strukturált szekciókkal:
     - „Mi az amortizáció röviden?"
     - „Mire kell figyelned?"
     - „A 2500 RON szabály"
     - „Ha bizonytalan vagy" → link a Használati útmutatóba
   - Kép/ikon illusztráció opcionálisan (ha van rá kapacitás)

3. **Dashboard-kártya a Leltárban**
   - A leltár főoldalán egy kis kártya: „Értékcsökkenés ebben az évben: X RON" + „Teljesen lefutott eszközök: Y darab"
   - Kattintható → szűrt lista

### P1 — Szükséges

4. **Üzembe helyezés dátuma** opcionális mező hozzáadása
   - DB migráció: `ALTER TABLE leltar_tetelek ADD COLUMN uzembe_helyezes_datuma date`
   - Form mező a leltári modalban
   - Számítási logika módosítása: `purchaseDate` helyett `commissioningDate ?? purchaseDate`

5. **Katalóguskód-bővítés** a javasolt 8 új tétellel
   - Egyszerű append a `INVENTORY_AMORTIZATION_CATALOG`-ba

6. **Használati útmutató szekció** (a pénzügyi Útmutató fül 14. szekciója)
   - Átvezető szöveg a Pénzügy → Leltár modulba
   - Táblázat a katalógusból: mi mire van, hány év a javasolt
   - GYIK: „Hol van a templom maga?", „Ingatlant is kell amortizálni?"

### P2 — Opcionális, későbbre

7. **Maradványérték** mező
8. **Kivezetés indoka** mező és riport
9. **Havi amortizációs napló** nyomtatvány (a könyvelőnek: melyik hónapban mennyi írt le)
10. **Katalógus keresése** autocomplete-tel (ha a katalógus 30+ tételnél szélesedik)

---

## Adatmodell változtatások

### Minimális (P0 nélkül is működik)
Nincs DB változás — csak UI/magyarázat.

### P1 csomag

```sql
-- leltar_tetelek bővítés
ALTER TABLE public.leltar_tetelek
  ADD COLUMN IF NOT EXISTS uzembe_helyezes_datuma date,
  ADD COLUMN IF NOT EXISTS alapeszkoz_kuszob_figyelmen_kivul boolean DEFAULT false;

COMMENT ON COLUMN public.leltar_tetelek.uzembe_helyezes_datuma IS
  'Amortizáció az üzembe helyezés hónapjától indul. Ha NULL, a beszerzés dátumát használjuk.';
COMMENT ON COLUMN public.leltar_tetelek.alapeszkoz_kuszob_figyelmen_kivul IS
  'True, ha a lelkész tudatosan figyelmen kívül hagyta a 2500 RON alapeszköz küszöböt.';
```

### P2 csomag

```sql
ALTER TABLE public.leltar_tetelek
  ADD COLUMN IF NOT EXISTS maradvany_ertek_ron numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kivezetes_indoka text CHECK (
    kivezetes_indoka IS NULL OR kivezetes_indoka = ANY (ARRAY['selejtezes','lopas','adomanyozas','eladas','egyeb'])
  );
```

---

## Tesztelési szempontok

1. **2500 RON alatt**: új tétel 1000 RON-nal → figyelmeztetés, de mégis elfogadható
2. **Üzembe helyezés későbbi**, mint beszerzés: amortizáció a később indul
3. **Üzembe helyezés NULL**: amortizáció a beszerzésből indul (backward compat)
4. **Amortizáció teljes lefutása**: régi tétel (2015-ös vásárlás, 5 éves élettartam) → aktuális érték 0
5. **Katalóguskód nélkül**: amortizáció kézi `hasznalati_ido`-ból is számolódik
6. **Mennyiség > 1**: az értékek szorzódjanak a mennyiséggel

---

## Kockázatok

1. **Jogszabályi küszöb változás** (2500 RON → más) — konstansként kell tartani, ne legyen hardcoded
2. **Az „alapeszköz_kuszob_figyelmen_kivul" flag** visszaélési kockázat — a könyvelő emiatt kaphat rossz képet. **Policy**: ezt a flag-et csak `esperes` vagy `admin` állíthassa (elkeríteni a lelkészeket). Alternatíva: a lelkész állíthatja, de a rendszer **figyelmeztetést küld az esperesnek**.
3. **Üzembe helyezés vs. beszerzés** zavaró lehet a lelkésznek — a magyarázó szöveg **kritikusan fontos**, és legyen **alapértelmezés**: „ha nem biztos vagy, hagyd üresen".

---

## Nyitott kérdések

1. A **2500 RON alapeszköz küszöb** mikor lépett életbe, és hol konfiguráljuk (rendszerszintű konstans, vagy a `bealitas` táblában, hogy gyülekezetenként felülírható legyen)? — **Javaslat**: rendszerszintű konstans, mert jogszabály.
2. Az **üzembe helyezés dátuma** kötelezőnek vagy opcionálisnak legyen? — **Javaslat**: opcionális, UI-ban ajánljuk.
3. A katalógus **bővítése** (8 új tétel) **most** kerüljön a rendszerbe, vagy csak a P1 csomaggal? — **Javaslat**: **most**, mert önmagában nem okoz kárt és a felhasználó csak 10 tétellel akar dolgozni, de a 10 helyett a fontosak legyenek benne.
4. **A leltári dashboardba** egy amortizáció-kártya — **igen/nem**, és hova (főoldal, vagy külön „Vagyonfigyelő" fül)?
