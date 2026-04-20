# KARTOTEKA — WC-2 Oblio UI átszervezés (felhasználói visszajelzés alapján)

**Dátum**: 2026-04-16
**Állapot**: **implementáció folyamatban** — API-ellenőrzés kész, kódátszervezés 80%
**Előzmény**: WC-2.5 + WC-2.6 backend + UI elkészült, de a elhelyezés nem optimális

## Haladási napló

- **2026-04-16 agent API-ellenőrzés kész**: Román státuszok (`nepreluat`/`in_prelucrare`/`ok`/`nok`), `GET /api/docs/invoice` lista-lekérdezés hivatalos, `client.vatPayer` mező hiányzott — kijavítva
- **2026-04-16 DB séma fix (WC-2.5.b)**: `2026-04-16-wc2-oblio-status-fix.sql` migráció román státusz értékekre (CHECK constraint + default + komment) — felhasználó által lefuttatva
- **2026-04-16 kód frissítés (WC-2.5.b + WC-2.6.b)**:
  - `lib/finance/oblio/oblio-types.ts` → `OblioEinvoiceStatus` ROMÁN, `OblioInvoiceListParams/Response/Item` típusok, `OblioClient.vatPayer`
  - `lib/finance/oblio/oblio-client.ts` → `listInvoices()` új fv. a search végpontra
  - `lib/finance/oblio/oblio-status-labels.ts` → magyar címke + szín mapper a status értékekre
  - `app/(dashboard)/penzugy/oblio-actions.ts` → `issueInvoice`/`syncInvoiceStatus` román státuszokra áttérve
  - `app/(dashboard)/penzugy/oblio-lookup-actions.ts` → `findOblioMatchForTransaction()` server action (DB → Oblio API lookup 60 mp cache-sel)
  - `components/finance/oblio-status-icon.tsx` → új komponens tranzakciók listájához (státusz + opcionális „+ Számla" gomb)
  - `components/finance/oblio-status-chip.tsx` → **új** chip a Pénzügy hero-ban (minden fülön elérhető) + integrált beállító modal
  - `components/finance/finance-tabs.tsx` → `OblioStatusChip` beépítve a hero chip-sorba a fülek színének megfelelő (teal) modal stílussal
  - `components/finance/dashboard-tab.tsx` → `OblioConfigCard` eltávolítva (átköltözött chip-be)
  - `components/finance/transactions-tab.tsx` → új „🧾" oszlop az Oblio státuszhoz, bérleti díj kategórián szerződés-lookup + „+ Számla" gomb
- **2026-04-16 kód frissítés (WC-2.6.c)**:
  - `transactions-tab.tsx` új propot kapott: `rentalContracts?: RentalContractRow[]`
  - `rentalCelIds` halmaz: bevCelMap-ből a 104.04 / 104.05 kódhoz tartozó `id_befizetescel`-ek
  - `rentalByName` map: bérlő név (és cég név) → szerződés (csak aktív, nem comodat, nem lejárt)
  - `findContractForPayment()`: befizetés `forrasa` ↔ szerződés bérlő név (közvetlen + ilike fallback)
  - Ha matchel és nincs Oblio match → „+ Számla" gomb a tranzakció sorában → előtöltött `OblioIssueInvoiceDialog`

---

## Felhasználói igények (2026-04-16)

1. **Oblio beállítás helye**: a Pénzügy **Áttekintés** oldalra költözik, nem a Bérleti szerződések fülön marad
2. **Kapcsolat monitorozás**: az Áttekintésen folyamatosan figyeli, hogy a kapcsolat rendben van-e
3. **Tranzakciók listán**: minden számla esetén a rendszer ellenőrizze az Oblio-ban (dátum + cégnév alapján), hogy megjelent-e — **ikon jelezze**
4. **Számla kiállítás**: felhasználóbarát, logikus hely

---

## Hogyan értelmezem

### Dashboard (Áttekintés) fül

A dashboard az egyetlen oldal, amit a lelkész naponta lát. Ezért:
- **TVA widget** (már van) — adózási státusz monitorozás
- **Oblio státusz kártya** (új) — kapcsolat-monitor, 3 állapot:
  - 🔴 **Nincs beállítva** — figyelmeztető kártya + "Beállítás" gomb
  - 🟢 **Kapcsolat OK** — rövid összefoglaló (email, CIF, utolsó teszt)
  - 🟡 **Régi teszt / sikertelen** — "Kapcsolat tesztelése" gomb kiemelve

A kártya kibontva beállítási formot is tartalmazhat (ahogy most a `OblioConfigCard` csinálja).

### Tranzakciók fül (bevétel/kiadás lista)

Minden sorban (befizetes + kiadas) új kis **Oblio-státusz ikon**:
- 🟢 **Számla megvan Oblio-ban** — ha van kapcsolódó `oblio_szamlak` rekord, és az Oblio API is visszaigazolja
- 🔵 **E-Factura elfogadva** — SPV visszaigazolta
- 🟡 **Függőben** — SPV-re ment, de még nincs válasz
- 🔴 **Elutasítva** — SPV rejected
- ⚪ **Nincs számla** — nincs kapcsolódó Oblio rekord (pl. persely, járulék)

Az ikon **hover-on magyarázat**, **kattintásra** részletek: PDF, státusz, re-sync gomb.

### Számla kiállítás helye

**Hol kezdeményezzük** a számla kiállítását?

**Javaslat — 2 belépési pont**:
1. **Bérleti szerződésről** (meglévő): kattintás a szerződés soránál → előtöltött form
2. **Tranzakció sorából**: ha van egy befizetés, de nincs hozzá kiállított számla, a sorban egy **"Számlát állít ki"** gomb → előtölti a befizetés adataiból

### Opcionálisan: új „Számlák" fül (most még nem)

Jövőbeli bővítés lehet egy komplett számla-kezelő fül, de **most** elég a fenti integráció. Nem akarunk redundáns helyet csinálni.

---

## Implementációs terv

### Lépés 1: Dashboard Oblio státusz kártya

- Áthelyezni a `OblioConfigCard`-ot a `rental-tab.tsx`-ből
- Elhelyezni a `dashboard-tab.tsx`-ben, a TVA widget mellé/alá
- **Opcionális egyszerűsítés**: a dashboard-on csak státuszt mutatunk, kattintásra nyílik egy teljes beállítási modal

### Lépés 2: Tranzakciók ikon

**Új komponens**: `OblioStatusIcon.tsx`
- Props: `transaction: { datum, forrasa|atvevo, osszeg, szamadasicel_kod }`
- Belül:
  - Első lekérdezés: `oblio_szamlak` lekérdezés a DB-ből
  - Ha van match → ikon + státusz az `e_factura_status` alapján
  - Ha nincs → szürke ikon, tooltip „Nincs számla"

**Új server action**: `findOblioMatchForTransaction(params)`:
- Bemenet: tranzakció dátum ± tolerancia, bérlő név / cégnév, összeg
- Első lépés: DB query `oblio_szamlak` → ha van match, vissza
- **MÁSODIK lépés (ha lista-lekérdezés van az API-ban)**: Oblio API search `/api/docs/invoice` → ha ott is van, felveszi az adatot a DB-be (sync)
- Visszaad: `{ status, pdfUrl?, oblioSzamlaId?, oblioInvoiceNumber? }`

**Feltétel**: az agent kutatás visszaigazolja-e a lista-lekérdezés lehetőségét. Ha nincs ilyen, csak a DB-beli `oblio_szamlak`-t nézzük.

### Lépés 3: Tranzakciók tab integrálása

- `transactions-tab.tsx`-be új oszlop "Számla" (desktop) vagy sor-badge (mobil)
- Hover / kattintás részletek

### Lépés 4: Számla kiállítás a tranzakciók listáról is

Ha egy sor bérleti bevétel (szamadasicel 104.04 vagy 104.05) és **nincs** hozzá Oblio számla → gomb „Számlát állít ki", ami ugyanazt az `OblioIssueInvoiceDialog`-ot megnyitja, de a `befizetes_id`-t és a bérleti szerződés kapcsolatot auto-tölti.

---

## Oblio API validáció — váróban

Az API ellenőrzés (agent) eredményét fogom felhasználni, **mielőtt** a lista-lekérdezés funkciót kódolnám. Ha az Oblio nem támogat lista-lekérdezést dátum/partner szerint, akkor alternatíva:
- Csak a DB-ben tárolt `oblio_szamlak` alapján ellenőrzünk
- A kiállított számláknak külön egy `oblio_invoice_id` mezőt tartunk, ami alapján később fel lehet keresni

---

## Kockázatok

1. **API validáció eredménye**: ha az agent kiderít egy **hibás** endpoint nevet vagy mezőt a jelenlegi kódunkban, át kell írnunk — pár fájl érintett
2. **Lista-lekérdezés hiánya**: ha az Oblio nem ad lista-searcht, az „ellenőrizze megjelent-e" logika csak a DB-beli match-re épül, ami nem tükrözi az Oblio-t pontosan. Ez szabadabb logika, de elegendő, ha a KARTOTEKA-ból mindig az Oblio-ba is mentünk (szinkron tartás).
3. **Rate limit**: ha minden tranzakciónál megkérdezi az Oblio-t, rate-limit-be futhatunk. Cache-elni kell.

---

## Munkacsomagok

- **WC-2.5.b**: Oblio status kártya a dashboardon (áthelyezés + átalakítás)
- **WC-2.6.b**: Tranzakció-soros Oblio státusz ikon
- **WC-2.6.c**: Tranzakcióról számla-kiállítás (+2. belépési pont)

Ezek **a meglévő WC-2.5/2.6 módosításai**, nem új munkacsomagok — ezért a `.b` és `.c` suffix.

---

## Következő lépés

### Felhasználó feladatai

1. ✅ **SQL migráció futtatás**: `migration-docs/sql/2026-04-16-wc2-oblio-status-fix.sql` — román státusz értékek a CHECK-ben, default `nepreluat`. **Csak akkor lép érvénybe, ha a lelkész futtatja a Supabase SQL editorban**
2. UI tesztelés: Áttekintés fülön Oblio kártya, Tranzakciók fülön új státusz-ikon oszlop

### Hátralévő fejlesztés (WC-2.6.c + WC-2.7+)

1. **Számlakiállítás tranzakció sorából** (2. belépési pont): bérleti díj jellegű befizetéssorokon (`szamadasicel_kod` 104.04 / 104.05) „Számlát állít ki" gomb, ha nincs Oblio match
2. **WC-2.7**: Chitanță-generátor (Oblio-mentes PDF, lokális számozás)
3. **WC-2.8**: `pg_cron` havi auto-számla + SPV státusz polling
4. **WC-2.9**: Képernyőkép kalauz a lelkészeknek (Oblio fiók létrehozás → API secret generálás)
