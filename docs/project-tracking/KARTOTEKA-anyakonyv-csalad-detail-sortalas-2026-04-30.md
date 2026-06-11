# Anyakönyvi modul: család-auto, új-személy, részletes nézet, sortálás

**Dátum:** 2026-04-30 (2026-04-30k — kilencedik dokumentált a napon)
**Állapot:** ✅ Befejezve — TS + ESLint clean
**Modul:** Anyakönyv (5 dialog + 1 új detail dialog + registry-tabs refaktor)

## Mit kért Endre

5 különálló észrevétel, mind az anyakönyvi modulhoz:

1. *"A kereszteléseknél, ellenőrizd, ha már van családhoz rendelve a személy
   akkor a szülők nevei is jelenjenek meg! Ha nem akkor lehessen hozzárendelni!"*
2. *"Keresztelésnél lehessen meghívni a tagnyilvántartás oldalról az új
   személy hozzáadása funkciót, amivel a keresztelendőt az anyakönyvi
   oldalon is hozzá lehet adni."*
3. *"Ha rákattintok egy sorra akkor jelenjen meg egy szép ablak az adatokkal,
   ne csak akkor amikor szerkeszteni szeretném! Ez mindenki anyakönyvi fülön."*
4. *"Lehessen sortálni az oszlopokat. Ezt is mindegyik anyakönyvi fülön."*
5. *"Az adatok szerkesztésénél a mezők legyenek kitöltve hogy látszódjanak
   mit akarok változtatni."*

## Mit csináltunk

### 1. Szülők auto-load (kérés #1)

Új server action: `getParentsForChild(personId)` — 3 fallback-szintű
szülő-lookup:

1. `gyerek` tábla → `csalad` tábla `id_ferfi` + `id_no` → `szemely` (a
   legtöbb új tagnál ez van)
2. `szemely.id_apja` / `szemely.id_anyja` CNP → `szemely` (régebbi
   tagoknál fordul elő)
3. (csak text — `apjaneve` / `anyjaneve` — a UI-on kézi mezőként marad)

A baptism dialog `useEffect`-ben hívja, amikor egy új keresztelendő
kiválasztódik, és csak akkor töltöm be a szülőket, ha még nincs manuálisan
beállított apa vagy anya. Az anya `szcs_nev`-jéből (leánykori név) az
`anyaLeanykori` mezőt is feltöltöm. Egy zöld badge jelzi a tényleges
auto-fill-t a "Szülők" szekció fejlécében.

### 2. Új személy hozzáadás (kérés #2)

A `MemberFormDialog` (a tagnyilvántartás moduljának teljes rögzítő
formája — 3 fül, kötelező lakcím, opcionális keresztelési stub) immár
beágyazva van a `BaptismDialog` tetején. Egy "Új személy a
tagnyilvántartáshoz" gomb (UserPlus ikon, kék hover) nyitja, és a
felhasználó visszatérése után toast emlékezteti, hogy az új személyt
keresheti a fő kereső mezőben.

> **Korlátozás:** mivel a `MemberFormDialog.onOpenChange` callback nem
> ad vissza ID-t, a baptism-dialog nem tudja automatikusan kiválasztani
> az új személyt. Ezt egy következő iterációban érdemes lehet javítani
> (pl. a `saveMember` action-t kibővítve egy `onSavedId?` callback-kel).

### 3. Részletes nézet (kérés #3)

Új közös komponens: `RegistryDetailDialog` — fülönként profilozott
read-only ablak. 8 fülre 8 layout, mind:

- Egy `PersonCard` a főszereplő(k)nek (név, ♂/♀, születési dátum + életkor)
- Profilfüggő mezők grid-ben: egyházi szám, állami szám, dátum(ok),
  helyszín, lelkész, szülők, felekezet, célgyülekezet, állapot stb.
- Elköltözötten plusz: átjelentkezési notifikáció státusza színes
  panellel (pending = amber, accepted = emerald, rejected = piros).
- Esketésnél: vegyes házasság jelzés.
- A footer-ben: Bezár / Törlés / Szerkesztés gombok. A két utóbbi az
  `onEdit` ill. `onDelete` callback-et hívja a parent-en.

Az aktiváláshoz a `registry-tabs.tsx` minden táblázat-során
`onClick={() => openDetail(d)}` van. Az akció-cella (✏️ + ✕)
`stopPropagation`-nel megakadályozza a részletes ablak megnyitását, ha
a felhasználó ezekre kattint.

### 4. Sortálás minden oszlopra (kérés #4)

Refaktoráltam a `registry-tabs.tsx` táblázat-rendert: a korábbi 3-helyen
ismételt `if (activeTab === ...) headerCells.push(...)` blokkok helyett
most egy adat-első `getColumns(tab): ColDef[]` deklaráció van, ami
egyszerre adja:

- `key`: az oszlop azonosítója (rendezéshez)
- `label`: a fejléc szövege
- `sortVal(d)`: a sortáláshoz használt érték (string vagy number)
- `render(d)`: a cella JSX
- `hidden?: 'md' | 'lg'`: reszponzív elrejtés

Az aktív sortálás magyar `localeCompare`-rel (`'hu'`) megy, és egy
`Badge` jelzi az aktív rendezést — az X-szel törölhető. Minden fejlécen
látszik egy ChevronUp / ChevronDown / ChevronsUpDown indikátor.

### 5. Edit-modálban kitöltött mezők (kérés #5)

A 4 dialog közül 4-et már korábban (2026-04-30j) kibővítettem teljes
edit-támogatással. A konfirmáció dialog volt az egyetlen, amelyiknek
nem volt editEntry support — most kapott:

- `ConfirmationDialog` dual-mode (batch / single edit). Ha `editEntry`
  van, csak egy konfirmáció szerkeszthető (személy + dátum + lelkész +
  egyházi szám + megjegyzés), és az új `saveConfirmationSingle` server
  action menti.

A többi dialognál (baptism, marriage, burial, movement) ellenőriztem,
hogy az editEntry minden mezőjét felhasználjuk — már igen, a
2026-04-30j-i frissítések után.

## Érintett fájlok

- `apps/web/components/registry/registry-detail-dialog.tsx` (új)
- `apps/web/components/registry/registry-tabs.tsx` (refaktor)
- `apps/web/components/modals/baptism-dialog.tsx` (auto-load + új-személy)
- `apps/web/components/modals/confirmation-dialog.tsx` (editEntry support)
- `apps/web/app/(dashboard)/anyakonyv/actions.ts` (`getParentsForChild`,
  `saveConfirmationSingle`)
- `apps/web/lib/validations/registry.ts` (`confirmationSingleSchema`)
- `docs/CHANGELOG.md` (`2026-04-30k` bejegyzés)

## Verifikáció

- `npx tsc --noEmit` ✅ clean
- `npx eslint <érintett fájlok>` ✅ clean
- Nem futtattam böngészőben — Endre kéri, hogy nézze meg.

## Hátralevő (későbbre)

- A baptism-dialog "Új személy" gombja után az új személy ID-jét nem
  kapjuk meg automatikusan — egy következő iterációban a `MemberFormDialog`
  `onSaved(id)` callback-jét érdemes hozzáadni.
- A 2 Kelemen nővér (id 1162, 1163) még döntésre vár.
- Anyakönyvi import warning, ha az importálandó tag `vallas != református`.
- Desktop-Tauri release csomagolás — `ops/release-build.ps1` futtatás.
