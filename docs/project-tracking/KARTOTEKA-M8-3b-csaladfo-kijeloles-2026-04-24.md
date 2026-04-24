# KARTOTEKA — M8.3b: családfő-kijelölés a family-detail-dialogban

**Dátum**: 2026-04-24 (éjjel)
**Fázis**: M8.3b (második alfázis az M8.3 család-kezelőn belül)
**Státusz**: ✅ KÉSZ — a lelkész a család-portré modalban egy kattintással kijelölhet családfőt.

## Mit ad

Az M8.3a olvasási rétegre épül. A `FamilyDetailDialog` most:

- Minden családtagnál (apa, anya, gyerekek) mutatja, **ki a családfő** — amber „👑 Családfő" badge-dzsel
- A nem-családfő tagok mellett **„Családfő" gomb** (outline, Crown ikonnal)
- Kattintás → browser-confirm → 2-lépcsős UPDATE:
  1. Ha van jelenlegi családfő → `csaladfo: false`
  2. Az új tag → `csaladfo: true`
- Sikeres művelet után banner (success / conflict / offline / error) és auto-refresh
- Offline is működik — a meglévő `updateSzemelyEntry` optimistic-local + outbox-fallback

## Design-döntések

### 1. Több családfő támogatás (átmenetileg)

Szigorúan véve egy család egy családfővel rendelkezik. A webes logika sem ellenőrzi SQL-szinten, csak UI-szinten — ugyanaz a filozófia itt: a 2-lépcsős UPDATE előbb **mindegyiket** kikapcsolja, aztán az újat bekapcsolja. Ha a művelet közben megszakad (pl. hálózat elveszik a két lépés között), elképzelhető, hogy egy pillanatig 0 családfő van — OK, a második művelet az outbox-ban várakozik.

### 2. Nem-atomic — tudatosan

A két UPDATE külön `updateSzemelyEntry` — **nem tranzakcióban**. Miért:
- A szemely már `revision`-alapú optimistic concurrency-t használ
- Ha egy köztes hiba történik, a részleges állapot (1 családfő kikapcsolva, új még nem bekapcsolva) a következő sync-en automatikusan konzisztensre rendeződik
- Tranzakció-szintű atomicity bonyolítaná a sync-réteget a megérkezett érték mellett nem hoz valós adat-integritási előnyt V1-ben

Ha a későbbi polish során kiderül, hogy egy család rendszeresen több családfővel marad (race-condition), egy szerver-oldali trigger vagy CHECK constraint kikényszerítheti a `COUNT(csaladfo=true) = 1 PER CSALAD` szabályt.

### 3. `csaladfo` flag vs. `csalad.id_ferfi/id_no`

Ezek **különböző fogalmak**:
- `csalad.id_ferfi/id_no` — a család **szerkezete**: ki az apa/anya szerepkörben
- `szemely.csaladfo` — a **pénzügyi/adminisztratív** családfő, aki a gyülekezet felé a család reprezentánsa (tagdíj, kapcsolattartás)

Ezért a családfő nem kötelezően a férfi — lehet az anya, vagy egy felnőtt gyermek is. Az UI minden szülőre + gyermekre engedi a kijelölést.

### 4. Mi jelenik meg használatban

```
┌─ Szülők ─────────────────────────────────┐
│ ♂ Apa                                     │
│   Kovács József (45 éves) 👑 Családfő    │
│                                           │
│ ♀ Anya                                    │
│   Kovács Klára (41 éves)      [Családfő] │
└───────────────────────────────────────────┘

┌─ Gyermekek (3) ──────────────────────────┐
│ 👤 Kovács Péter · fiú · 18 éves [Családfő]│
│ 👤 Kovács Mária · lány · 14 éves          │
│ 👤 Kovács Dávid · fiú · 8 éves            │
└───────────────────────────────────────────┘
```

A „Családfő" gomb csak a nem-családfő tagok mellett látszik. A családfő esetén a badge van, gomb helyett.

## Fájlváltoztatások

### Módosított

- **`apps/desktop/src/lib/tauri-sqlite-backend.ts`**: `getLocalCsaladDetail` bővítve — `csaladfo` + `revision` mezők visszaadva a férfi-nő-gyermek sorokra. A UI-nak kell a `revision` az `updateSzemelyEntry` conditional-check-éhez.
- **`apps/desktop/src/components/family-detail-dialog.tsx`**: teljes átírás (~430 sor):
  - Új `userId` prop
  - Új `busyMemberId` state a concurrent-click-védelemhez
  - Új `banner` state (success / conflict / offline / error)
  - Új `handleSetCsaladfo(memberId, name, revision)` async fn
  - Új `MemberRow` unified komponens (szülő + gyermek ugyanúgy)
  - Új `CsaladfoBadge` komponens (amber + Crown ikon)
  - Minden családtag sor `bg-amber-50/60` háttért kap, ha ő a családfő
- **`apps/desktop/src/pages/families-page.tsx`**: a dialog most megkapja a `userId`-t + `onClose` a refresh-hez is

## Hátra az M8.3-ban

- **M8.3c** (~4-5 óra): új család létrehozása + szerkesztés
  - Rust v18 migráció: `csalad_pending_local` + `gyerek_pending_local` pending-táblák
  - Új core/validation-sémák: `CsaladCreateInput`, `CsaladUpdateInput`
  - Új sync-helperek: `pushPendingCsalad`, `pushPendingGyerek`
  - UI: „Új család" gomb a families-page-en, „Szerkesztés" gomb a family-detail-ban, „Gyermek hozzáadása" dialog

## Ellenőrzés

Manuális kód-ellenőrzés (Node nincs PATH-ban a tsc-hez):
- A `getLocalCsaladDetail` SELECT-jei szerint a `csaladfo` + `revision` a `szemely_local`-ban megvan (Rust v5 séma)
- A `handleSetCsaladfo` csak akkor fut, ha `detail` nem null (type-guard)
- A `MemberRow` defenzív — `memberId==null` esetén a gomb nem jelenik meg
- Nincs új import-dependency a whitelist-en kívül
