# KARTOTEKA - szerepkör nélküli várakoztatás és pénzügyi bootstrap

**Dátum**: 2026-04-25  
**Státusz**: elkészítve  
**Téma**: szerepkör nélküli belépés lezárása + felesleges éves pénzügyi popup kivezetése

## Kiinduló igény

1. Ha egy felhasználó aktív státuszú, de nincs érvényes szerepköre, ne férjen hozzá a rendszerhez.
2. Ilyenkor a rendszer egy várakozó képernyőt mutasson, és legyen rajta beépített segítségkérő az admin felé.
3. A pénzügyi modulban az „Éves Pénzügyi Beállítások” felugró felesleges, mert a welcome wizard már elkéri ezeket az adatokat.

## Diagnózis

### Szerepkör nélküli belépés

- A jelenlegi auth-logika több ponton csendes fallbackot adott a hiányzó `profiles.role` mezőre.
- Ez gyakorlatban azt jelentette, hogy a rendszer egy szerepkör nélküli profilt is `lelkesz` fallbackként kezelhetett.
- Emiatt a „nincs szerepkör” állapot nem külön várt/lezárt rendszerállapotként jelent meg.

### Pénzügyi popup

- A `penzugy/page.tsx` gyülekezeti scope-ban eddig egy külön `YearlySettingsDialog`-ot nyitott, ha az adott évre nem volt `bealitas` sor.
- Ugyanakkor a welcome wizard már begyűjti és eltárolja a gyülekezeti éves járulék / határidő adatokat.
- Ezért a dialog duplikált adatbekérés volt.

## Választott javítás

### 1. Szerepkör nélküli felhasználó -> várakozó képernyő

- Bevezettem egy explicit runtime-ellenőrzést az érvényes elsődleges szerepkörre.
- Ha a profil aktív, de nincs ismert `profiles.role`, akkor:
  - auth után a user a `/pending?reason=no-role` képernyőre kerül,
  - dashboard és setup layout alatt sem kap hozzáférést,
  - az effektív gyülekezeti kontextus nullázódik, így a szerveroldali scope sem marad „ál-lelkészi” állapotban.
- A profilnézetben is megszűnt a félrevezető `lelkesz` fallback: a hiányzó szerepkör most explicit „Nincs hozzárendelt szerepkör” állapotként jelenik meg.

### 2. Beépített segítségkérés a várakozó képernyőn

- A meglévő `SupportDialog` került be a várakozó képernyőre.
- Így a user külön navigáció nélkül tud üzenetet küldeni az adminnak ugyanazzal a beépített support-csatornával, amit a rendszer máshol is használ.

### 3. Éves pénzügyi popup kivezetése

- A `YearlySettingsDialog` meghívását kivettem a pénzügyi kezdőoldalról.
- Helyette a szerveroldal csendesen megpróbálja létrehozni az aktuális évi `bealitas` sort a `congregations.eves_jarulek` és `congregations.jarulek_hatarid` mezőkből.
- Siker esetén a pénzügyi oldal rögtön normál módon töltődik be, popup nélkül.
- Csak akkor jelenik meg információs fallback kártya, ha az automatikus előállítás sem lehetséges.

## Miért ez a legbiztonságosabb irány

- Nem enged szerepkör nélküli usert „csendben lelkésszé” válni fallback miatt.
- Nem vezet be új support-mechanizmust, hanem a meglévő beépített admin-üzenetküldést használja.
- Nem kér be újra olyan pénzügyi adatot, amit a wizard már egyszer elkért.
- Nem nyúl a pénzügyi modul belső tablogikájához, csak a hiányzó éves állapot előkészítését rendezi.

## Érintett fájlok

- `apps/web/lib/auth/roles.ts`
- `apps/web/lib/auth/effective-access.ts`
- `apps/web/app/(dashboard)/layout.tsx`
- `apps/web/app/(setup)/layout.tsx`
- `apps/web/app/(auth)/pending/page.tsx`
- `apps/web/components/auth/pending-approval-client.tsx`
- `apps/web/app/(dashboard)/penzugy/page.tsx`
- `apps/web/app/(dashboard)/profile/actions.ts`
- `apps/web/components/modals/profile-dialog.tsx`

## Ellenőrzési javaslat

1. Próbálj bejelentkezni egy olyan userrel, akinek `profiles.status='active'`, de a `profiles.role` üres vagy hibás.
2. Elvárt: a rendszer a várakozó képernyőt mutatja, nem enged dashboardra.
3. Elvárt: a „Segítséget kérek” gomb megnyitja a beépített support dialógot.
4. Lépj be egy olyan gyülekezeti userrel, akinél az aktuális évre még nincs `bealitas`, de a gyülekezetben az éves járulék és határidő mezők már ki vannak töltve.
5. Elvárt: a pénzügyi oldal popup nélkül tölt be, és az éves beállítás csendben létrejön.
