# KARTOTEKA — Offline-first PWA működési útmutató

**Dátum**: 2026-04-15
**Státusz**: TERV — jóváhagyott architektúra, implementáció elkezdve
**Források**:
- **Plan fájl**: `~/.claude/plans/purrfect-coalescing-quiche.md` (részletes implementációs terv)
- **Projekt log**: 038. lépés (az MVP kezdete)
- **Célzott közönség**: fejlesztők, és alap a későbbi felhasználói útmutatóhoz

---

## 📖 Tartalomjegyzék

1. [Mit csinál a rendszer? (felhasználó szemszögből)](#1-mit-csinál-a-rendszer)
2. [Mi történik a háttérben? (architektúra)](#2-mi-történik-a-háttérben)
3. [A lelkész első használata (setup flow)](#3-a-lelkész-első-használata)
4. [Napi munkamenet — tipikus forgatókönyvek](#4-napi-munkamenet)
5. [Excel struktúra — mit lát a user a fájlban](#5-excel-struktúra)
6. [Szinkronizáció — hogyan működik?](#6-szinkronizáció-hogyan-működik)
7. [Törlés — a 4 szcenárió](#7-törlés-a-4-szcenárió)
8. [Kuka (Recycle bin) — hogyan működik?](#8-kuka-recycle-bin)
9. [Missziós műhely offline — bookmark minta](#9-missziós-műhely-offline)
10. [Konfliktusok — mit lát, mit tud tenni a user](#10-konfliktusok)
11. [Hibaelhárítás és gyakori kérdések](#11-hibaelhárítás)
12. [Technikai építőkövek (fejlesztőknek)](#12-technikai-építőkövek)

---

## 1. Mit csinál a rendszer?

### A lelkész szemszögéből

A KARTOTEKA **offline-first PWA** azt jelenti, hogy a lelkipásztor:

- **Telefonra, tabletre, laptopra telepítheti** a rendszert, mint egy natív alkalmazást
- **Internet nélkül is dolgozhat** benne — új személyt vehet fel, befizetést rögzíthet, anyakönyvi bejegyzést csinálhat
- **Amikor újra van internet, a változások automatikusan szinkronizálódnak** a központi (Supabase) adatbázissal
- **Minden adata Excel fájlokként is megtalálható** a számítógépén, egy általa választott mappában — úgy, hogy bármikor meg tudja nyitni Excelben, megnézheti, ki tudja nyomtatni, archiválhatja

### Mit jelent az "átlátszó Excel"?

A **KARTOTEKA/<gyülekezet>/** mappában fellelhető Excel fájlok NEM csak egy "export" — ezek **élő képek** az adatbázisról, amik minden módosításkor automatikusan frissülnek. És, ami még fontosabb: **a lelkész szerkesztheti őket Excelben, és a változások visszakerülnek a rendszerbe** (kérdéssel megerősítve).

### Mi a lényege?

Három előnyt ad egy hagyományos felhőalapú rendszerhez képest:

1. **Offline munka**: a plébánián ahol gyenge az internet, vagy az utcán, vagy utazás közben — a rendszer teljesen működik.
2. **Sebesség**: minden listabetöltés INDEXEDDB-ből jön (kb. 50-100x gyorsabb, mint egy internetes lekérdezés).
3. **Backup + hozzáférhetőség**: a lelkész egy katasztrófa esetén (pl. Supabase szolgáltatás kiesik 2 napra) továbbra is dolgozhat a saját gépén lévő Excel fájlokból.

---

## 2. Mi történik a háttérben?

A rendszer három különböző tárolási rétegen dolgozik, amiket a **sync orchestrator** tart szinkronban:

```
┌─────────────────────────────────────────────────────────────────────┐
│  1️⃣  SUPABASE (felhőben, authoritative)                             │
│  - A "hivatalos" adatbázis                                          │
│  - Minden user változásai ide futnak be és innen terjednek szét     │
│  - RLS védi (minden user csak azt látja, amit szabad)               │
└─────────────────────────────────────────────────────────────────────┘
                         ↑ ↓ (sync orchestrator)
┌─────────────────────────────────────────────────────────────────────┐
│  2️⃣  INDEXEDDB (lokális, Dexie-ben)                                 │
│  - A gyors helyi másolat — az app ebből olvas                        │
│  - Optimistic writes ide kerülnek először                           │
│  - Mutation queue: várakozó változtatások online-visszatérésig      │
└─────────────────────────────────────────────────────────────────────┘
                         ↑ ↓ (debounced flush / file watcher)
┌─────────────────────────────────────────────────────────────────────┐
│  3️⃣  EXCEL FÁJLOK (lokális fájlrendszer)                            │
│  - KARTOTEKA/<gyülekezet>/tagnyilvantartas.xlsx stb.                │
│  - Ember-olvasható, szerkeszthető                                   │
│  - Transzparens backup                                              │
└─────────────────────────────────────────────────────────────────────┘
```

### Mit jelent a "sync orchestrator"?

Egy láthatatlan, állandóan futó háttérfolyamat (a böngészőben), ami gondoskodik róla, hogy a három réteg ne térjen el egymástól. Feladatai:

- **Pull**: 2 percenként lekéri az új változásokat Supabase-ből → beírja Dexie-be → Excel frissül
- **Push**: mutation queue-ből a várakozó változásokat felküldi Supabase-re
- **Flush**: 30 másodperc idle után az Excel fájlokat újraírja
- **Watch**: figyeli, ha a user szerkeszti az Excel fájlokat kívülről

---

## 3. A lelkész első használata

### 1. Alkalmazás telepítése

- Chrome-ban: `Beállítás menü → Alkalmazás telepítése`
- Edge-ben: `...` menü → `Alkalmazások → Alkalmazás telepítése`
- Telefonon: Android Chrome → "Kezdőképernyőre helyezés"

Ezzel a rendszer egy **önálló ablakban** indul, nem kell minden alkalommal böngészőt nyitni.

### 2. Bejelentkezés

A szokásos email+jelszó páros (mint eddig). Az első bejelentkezés **online kell legyen** — a session + gyülekezet scope-olás Supabase-ről jön.

### 3. Setup Wizard — mappa választás

Bejelentkezés után, ha még nincs beállítva, a rendszer egy **Setup Wizard**-ot indít:

```
╔══════════════════════════════════════════════════════════════════╗
║  KARTOTEKA offline beállítás                                     ║
║                                                                  ║
║  Válassz egy mappát, ahova a gyülekezet Excel fájlai kerülnek.   ║
║  A rendszer egy KARTOTEKA könyvtárat hoz létre ott, azon belül   ║
║  pedig gyülekezet-név szerint almappákat.                        ║
║                                                                  ║
║  ⚠️ FONTOS: ne válassz OneDrive-ot, Dropbox-ot vagy Google       ║
║     Drive-ot! A fájlok személyes adatokat tartalmaznak, a        ║
║     felhős szinkronizálás adatszivárgást okozhat (GDPR).         ║
║                                                                  ║
║  Javasolt mappák: Dokumentumok, D:\Gyülekezet, Asztal            ║
║                                                                  ║
║               [ Mappa kiválasztása ]  [ Kihagyom ]                ║
╚══════════════════════════════════════════════════════════════════╝
```

**Ami ilyenkor történik**:
1. A böngésző megnyit egy natív mappa-választót
2. A rendszer ellenőrzi a kiválasztott útvonalat — ha `OneDrive`/`Dropbox`/`iCloud` substring van benne, erős warning jelenik meg
3. Létrejön a `KARTOTEKA/<gyülekezet-slug>/` struktúra
4. 9 üres Excel fájl létrejön (`_meta` munkalappal)
5. Az első teljes sync megtörténik: a Supabase-ből letölti az összes rekordot → beírja Dexie-be → Excel-be is
6. A `FileSystemDirectoryHandle` perzisztálódik Dexie-ben (reload után nem kell újra választani, csak a permission prompt)

### 4. Mappa struktúra az első sync után

```
D:\Dokumentumok\
└── KARTOTEKA\
    └── kolozsvar-belvaros\                   (gyülekezet slug)
        ├── _metadata.json                   ← ide sosem kell benyúlni
        ├── tagnyilvantartas.xlsx            ← minden modul egy fájl
        ├── penzugy.xlsx
        ├── anyakonyv.xlsx
        ├── munkanaplo.xlsx
        ├── leltar.xlsx
        ├── iktato.xlsx
        ├── sirhelyek.xlsx
        ├── jegyzokonyvek.xlsx
        └── misszios-muhely.xlsx             ← csak a bookmarked tartalom
```

---

## 4. Napi munkamenet

### Forgatókönyv A — Online munka (szokásos)

A lelkész leül a laptop elé reggel, megnyitja az alkalmazást (ikon a kezdőlapon).
1. **Bejelentkezés** (auto, session fél évig tart)
2. **Sync orchestrator** azonnal elindít egy pull-t → frissíti a Dexie-t
3. A lelkész **tagnyilvántartásba** megy → lista azonnal megjelenik (cache hit!)
4. Új keresztelő bejegyzés → form → Mentés
5. **Dexie-be bekerül azonnal** (optimistic update — a lista frissül 0.01 mp alatt)
6. **Mutation queue → push** — Supabase-re kb. 200 ms alatt feljut
7. **30 mp idle után**: Excel flush — `anyakonyv.xlsx` frissül a lemezen

A lelkész számára mindez teljesen láthatatlan — a lista azonnal jó, és 30 mp múlva a `Dokumentumok/KARTOTEKA/kolozsvar-belvaros/anyakonyv.xlsx` is frissül.

### Forgatókönyv B — Offline munka

A lelkész az utcán egy családot látogat. Nincs net.

1. Megnyitja az appot → bejelentkezett már → lista jön (Dexie cache)
2. A **status bar** felül sárga: "⚠️ Offline mód — 3 várakozó változtatás"
3. Beüt egy új családlátogatás rekordot → Mentés
4. **Dexie-be bekerül** → lista frissül
5. A rekord mellett egy kis `pending` badge (narancssárga óra ikon)
6. Mutation queue: `{ op: 'insert', table: 'csaladlatogatas', ... }`
7. Hazaér, wifi csatlakozik
8. Status bar zöldre vált: "✓ Szinkronizálás..."
9. **Push**: mutation queue-ban lévő bejegyzés feljut Supabase-re
10. A pending badge eltűnik
11. 30 mp múlva: `munkanaplo.xlsx` frissül a lemezen

### Forgatókönyv C — Excel-ben szerkesztés

A lelkészné vasárnap délután megnyitja a `Dokumentumok/KARTOTEKA/kolozsvar-belvaros/tagnyilvantartas.xlsx`-t Excelben.

1. Lát 250 sort a "Személyek" munkalapon
2. Javít 3 telefon-számot (ezek frissek, de rossz számmal voltak beírva)
3. Hozzáad 1 új sort (fejlécet hagyva üresen a `_rowId` oszlopot)
4. Ment Excelt

Hétfő reggel a lelkész megnyitja az appot:

1. **File watcher** észleli: `tagnyilvantartas.xlsx` `lastModified` változott
2. Popup: "Az Excel fájlban változtatásokat észleltünk. Átnézed?"
3. **Review oldalra** navigál: `/offline/import`
4. Itt látszik:
   ```
   tagnyilvantartas.xlsx — 4 változás:
   ┌────────────────────────────────────────────────────────┐
   │ ✓ MÓDOSÍTOTT: Kiss János telefon — +36 30 111 1111 →   │
   │              +40 744 123 456                           │
   │ ✓ MÓDOSÍTOTT: Szabó Mária telefon — ...                │
   │ ✓ MÓDOSÍTOTT: Nagy Péter telefon — ...                 │
   │ ✓ ÚJ SOR:     Fekete Éva (cnp: 2800101123456)          │
   │                                                        │
   │        [ Összes alkalmazása ]  [ Mégse ]               │
   └────────────────────────────────────────────────────────┘
   ```
5. A lelkész "Alkalmaz" → mutation queue → sync → Supabase frissül

### Forgatókönyv D — Hibás Excel-szerkesztés

A lelkészné véletlenül törli az egyik sort a Excel-ben (akart csak kijelölni egy cellát).

1. Ment Excelt
2. App következő file watcher futásánál észleli: 1 sor `_rowId` eltűnt
3. Popup: "⚠️ Excel-törlés észlelve — valóban törölni szeretnéd?"
4. Review oldal:
   ```
   Excel-ben 1 sort töröltél.  Biztos szeretnéd a Supabase-ből is törölni?
   ┌────────────────────────────────────────────────────────┐
   │ ⚠️ Kiss János (személy, 2019-05-02 felvéve)           │
   │                                                        │
   │   [ ◉ Visszaállítom Excel-be ]  (alapértelmezett)     │
   │   [ ○ Törlöm Supabase-ből is ]                        │
   │                                                        │
   │                    [ Alkalmaz ]                        │
   └────────────────────────────────────────────────────────┘
   ```
5. A lelkész "Visszaállít" → a következő flush újra kiírja a sort az Excel-be

**Ez a "biztonság előny" policy** — az Excel-törlés soha nem automatikus.

---

## 5. Excel struktúra

### Egy tipikus modul-fájl

**Példa: `tagnyilvantartas.xlsx`**

**Munkalap 1: `_meta`** (REJTETT — a user normál esetben nem látja)

| Cella | Érték | Magyarázat |
|---|---|---|
| A1 | `schemaVersion` | 1 |
| B1 | `module` | tagnyilvantartas |
| C1 | `congregationSlug` | kolozsvar-belvaros |
| D1 | `congregationId` | 8a4f2... (uuid) |
| E1 | `exportedAt` | 2026-04-15T14:32:11Z |
| F1 | `exportedBy` | Nagy János lelkipásztor |

**Munkalap 2: `Személyek`**

| Születési név | Családnév | Keresztnév | CNP | Telefon | ... | _rowId | _revision | _syncStatus |
|---|---|---|---|---|---|---|---|---|
| `birth_name` | `csaladnev` | `k_nev` | `cnp` | `telefon` | ... | (uuid) | (bigint) | clean |
| Kiss | Kiss | János | 1800101234567 | +40 744 123 | ... | abc-123 | 5 | clean |
| Nagy | Nagyné Szabó | Mária | 2820515123456 | +40 745 456 | ... | def-456 | 3 | pending |

**Fontos**:
- **1. sor**: display header (magyar, ember-olvasható)
- **2. sor**: technikai oszlopnév (snake_case, belső DB mező)
- **Utolsó 3 oszlop** (_rowId, _revision, _syncStatus): **NE TÖRÖLD!** Sárga színezés figyelmeztet.
  - `_rowId`: a sor egyedi UUID — ez azonosítja a rekordot a Supabase-ben
  - `_revision`: a sor verziószáma — konfliktus-felismeréshez kell
  - `_syncStatus`: `clean` (szinkronban), `pending` (várakozó offline write), `conflict` (konfliktus van)

**Munkalap 3: `Családok`**

Hasonló struktúra, de a `csalad` tábla mezőivel.

**Munkalap 4: `Presbiterek`**, stb.

### Lookup munkalapok (read-only)

Minden modul-fájlban lehetnek `_lookup_` prefixű munkalapok:

- `_lookup_adrlocality` — helységnevek
- `_lookup_befizetescel` — befizetés célok
- `_lookup_kiadascel` — kiadási célok
- `_lookup_szamadasicel` — számadási célok

**Ezek read-only reference data** — nem szerkeszthetők Excelben. A színezés (világos szürke háttér) jelzi ezt.

### Szín-kódolás (Excel-ben)

| Szín | Jelentés |
|---|---|
| 🟢 Zöld háttér (teljes sor) | Frissen szinkronizált |
| 🟡 Sárga háttér (teljes sor) | Pending (offline írt, szinkronizálásra vár) |
| 🔴 Piros háttér (teljes sor) | Konfliktus (user beavatkozása kell) |
| 🟨 Sárga oszlopok (_rowId, _revision, _syncStatus) | "NE TÖRÖLD" figyelmeztetés |
| 🟫 Szürke háttér (_lookup_ fülek) | Read-only |

---

## 6. Szinkronizáció — hogyan működik?

### A sync ciklus részletei

```
                        ┌────────────────────┐
                        │  App megnyílik     │
                        └─────────┬──────────┘
                                  │
                                  ▼
                        ┌────────────────────┐
                        │  Init pull (teljes │
                        │  ha első indítás,  │
                        │  delta egyébként)  │
                        └─────────┬──────────┘
                                  │
                                  ▼
              ┌───────────────────────────────────────┐
              │  2 perces timer: újabb pull           │ ◀──┐
              │  2 perces timer: queue flush          │    │
              │  30 mp debounced: Excel flush         │    │
              │  60 mp poll: Excel file watcher       │    │
              └─────────┬─────────────────────────────┘    │
                        │                                  │
                        ▼                                  │
              ┌───────────────────────────────────────┐    │
              │  Event loop: user interakció, UI      │────┘
              │  frissül, Dexie változik, push/pull   │
              └───────────────────────────────────────┘
```

### Sync states (status bar)

A képernyő tetején mindig látszik egy pici status bar:

| State | Ikon | Szín | Jelentés |
|---|---|---|---|
| Online, synced | ✓ | Zöld | Minden rendben, nincs várakozó change |
| Online, syncing | ⟳ | Kék (animált) | Éppen szinkronizál |
| Online, pending | ⟲ | Sárga | Van várakozó change, de még feltölti |
| Offline | ⊗ | Narancssárga | Nincs net, offline módban |
| Conflict | ⚠ | Piros | Konfliktus — user beavatkozás kell |
| Error | ✗ | Piros | Szinkron hiba — logokba kell nézni |

A status bar-ra kattintva megnyílik egy részletes panel: hány pending mutation, utolsó sikeres sync, utolsó hiba, stb.

### Mi számít "pendingnek"?

- Offline CRUD műveletek
- Online CRUD, amit a szerver még nem igazolt vissza (normál esetben <1 mp)
- Konfliktusba került műveletek, amire a user még nem döntött

---

## 7. Törlés — a 4 szcenárió

### A. Online app-ban törlés → azonnali soft-delete

1. Gomb → Confirm dialog
2. Dexie-ben elrejt + Supabase `UPDATE deleted = true`
3. Excel flush: sor eltűnik

### B. Offline app-ban törlés → queue

1. Gomb → Confirm
2. Dexie-ben `_pendingDelete = true` (elrejt UI-ból)
3. Queue: `{ op: 'delete', id }`
4. Online: push → Supabase soft-delete
5. Ha konfliktus (pl. szerver-oldali módosítás közben): dialog kérdezi

### C. Excel-ben törlés → WARNING, nem automatikus

- File watcher észleli
- Review dialog
- Alapértelmezett: "Visszaállítom" (biztonság)
- Csak explicit "Törlöm Supabase-ből is" után kerül a queue-ba

### D. Szerver-oldali törlés (másik user) → csendes vagy dialog

- Ha nincs helyi change: csendes eltávolítás Dexie-ből
- Ha van helyi change: konfliktus dialog ("Megtartom új rekordként / Elfogadom a törlést")

### A törlés utáni 30 napos biztonsági ablak

**Minden soft-delete bekerül a "Kuka"-ba** 30 napra (lásd 8. fejezet). Ezen idő alatt visszaállítható. 30 nap után a Supabase automatikusan véglegesít (hard delete).

---

## 8. Kuka (Recycle bin)

### Hol találja a user?

Minden modul oldalán, a modul hero-banner jobb felső sarkában egy **"🗑 Kuka"** gomb. Kattintásra:

```
URL: /tagnyilvantartas/kuka
```

### Mit lát a user ott?

```
╔══════════════════════════════════════════════════════════════════════╗
║  🗑 Kuka — Tagnyilvántartás                                          ║
║  30 napon belül törölt rekordok. 30 nap után véglegesen törlődnek.  ║
║                                                                      ║
║  ┌──────────────────────────────────────────────────────────────┐   ║
║  │ Név             Típus    Törölve          Marad    Műveletek │   ║
║  │ Kiss János      Személy  2026-03-28       2 nap    [Vissza]  │   ║
║  │ Nagy Csalad     Család   2026-03-25       5 nap    [Vissza]  │   ║
║  │ Szabó Mária     Személy  2026-03-02 †     28 nap   [Vissza]  │   ║
║  │                                                               │   ║
║  │ † A 30 napot meghaladt, mostantól veszélyben.                │   ║
║  └──────────────────────────────────────────────────────────────┘   ║
║                                                                      ║
║              [ Kuka ürítése (régi 30+ napos rekordok) ]              ║
╚══════════════════════════════════════════════════════════════════════╝
```

### Gombok jelentése

- **[Vissza]** (per sor): `UPDATE deleted = false` → visszakerül a normál listába
- **[Kuka ürítése]**: minden 30 napnál régebbi rekord hard delete (vége, nincs visszaút)
- **Automatikus cleanup**: Supabase pg_cron hetente hard-delete-eli a 30 napnál régebbi soft-delete-eket (MŰKÖDIK akkor is, ha a user nem ürít manuálisan)

### Miért van ez?

- **User-hiba ellen**: "Jaj, véletlenül kitöröltem..." helyett "Megyek a Kukába, visszaállítom"
- **Excel-hiba ellen**: ha a user véletlenül töröl egy sort Excelben ÉS a warning dialogon mégis "Törlöm Supabase-ből is" -t választ, a Kukából még visszaállítható
- **GDPR kompatibilis**: a személyes adat max 30 napig marad törlés után a rendszerben (a `deleted = true` flag ellenére), utána automatikus hard delete

---

## 9. Missziós műhely offline — bookmark minta

### Miért más, mint a többi modul?

A Missziós Műhely **közösségi modul** — sok lelkész egymás ötleteit nézi, kommentel, szavaz. Nem ésszerű a TELJES MM-et lokális cache-elni (adatvédelem + storage).

**Ezért** a MM különleges scope-ot kap:

### Automatikusan offline-elérhető

A user saját (ahol ő az `otletgazda`) ötletei + a projektek, amikbe csatlakozott + saját feltöltött segédanyagok → **automatikusan bookmark-olva**, benn vannak a `misszios-muhely.xlsx`-ben.

### User-választott bookmark-ok

A fórumban minden ötlet-kártyán megjelenik egy új gomb: **"📌 Mentés offline-ra"**

- Ha a lelkész látja egy érdekes ötletet és szeretné később olvasni offline → kattint
- Bekerül a `mm_bookmarks` táblába
- A következő sync-kor letöltődik Dexie-be → `misszios-muhely.xlsx`-be is
- Ugyanígy működik a projekteknél és segédanyagoknál

### Mit lát a user a Excel-ben?

```
misszios-muhely.xlsx
├── _meta
├── Saját ötleteim          (saját otletgazda)
├── Bookmark-olt ötletek    (user választott)
├── Projekteim              (amikbe csatlakoztam)
├── Segédanyagjaim          (saját feltöltés)
└── Bookmark-olt segédanyagok
```

### Ami NEM offline

- **Fórum** — mások ötleteit lapozni csak online
- **Új ötlet beküldése** — online (a rendszer nagyon sokféle validációt csinál)
- **Szavazás** — online (timing critical)
- **Kommentelés** — online
- **Gamifikáció (badge-ek, szintek)** — online
- **Moderáció** — online (admin-only, online feltételezett)

---

## 10. Konfliktusok

### Mikor keletkezik konfliktus?

Ha **egy adott sort két különböző helyen módosítottak az utolsó közös állapot óta**. Pl.:

- A lelkész offline módosít egy telefon-számot (Dexie pending)
- Közben a kollégája online módosítja ugyanazt a telefon-számot (Supabase updated_at frissült)
- A lelkész hazaér, netre csatlakozik — a push 409-et kap ("a te baseRevision nem egyezik a jelenlegivel")

### A rendszer háromféle stratégiát alkalmaz

**1. Automatikus "server-wins"** — bizonyos mezőkre ami nem user-editable:
- `updated_at`, `revision`, `created_at`, aggregated stats
- Ezek mindig a server verzióra frissülnek, dialog nélkül

**2. Automatikus "last-writer-wins" (field-level merge)** — ha a két oldal **különböző mezőket** módosított ugyanabban a sorban:
- Pl. user a "telefon"-t írta, server a "megjegyzés"-t
- 3-way merge: base → user + server változások kombinálódnak
- Csendes, dialog nélkül

**3. Manuális dialog** — ha ugyanazt a mezőt mindkét oldal módosította:
- Diff view megnyílik
- A user választ: "Enyém", "Övé", vagy "Manuálisan kombinálom"

### A konfliktus-dialog

```
╔════════════════════════════════════════════════════════════════╗
║  ⚠️ Konfliktus — Kiss János személy                            ║
║                                                                ║
║  Mindkét változat módosult közben. Melyiket tartsuk meg?       ║
║                                                                ║
║  Telefon mező:                                                 ║
║                                                                ║
║  ┌──────────────────────┬──────────────────────┐              ║
║  │  Enyém (helyi)       │  Övé (szerver)       │              ║
║  │  (offline szerk.     │  (kollégád szerk.    │              ║
║  │  2026-04-14 19:30)   │  2026-04-14 21:15)   │              ║
║  ├──────────────────────┼──────────────────────┤              ║
║  │  +40 744 123 456     │  +40 745 999 888     │              ║
║  └──────────────────────┴──────────────────────┘              ║
║                                                                ║
║  [ Enyémet tartom ] [ Övét tartom ] [ Manuálisan... ]          ║
╚════════════════════════════════════════════════════════════════╝
```

### Konfliktus → státusz

Amíg a user nem old meg egy konfliktust:
- A sor `_syncStatus = 'conflict'` (piros háttér az Excel-ben)
- Status bar piros: "⚠ 1 feloldatlan konfliktus"
- A UI-ban a sor rögtön feltűnik (keret piros)

---

## 11. Hibaelhárítás

### "Az Excel fájl nem frissül, amit az appban csinálok"

- Ellenőrizd a status bar-t: ha zöld (✓), akkor a sync rendben van
- 30 másodperces debounce van — ennyit vár, mielőtt Excel-re ír
- Kattints "Szinkronizálás most" gombra a status bar-ban → manuális flush
- Ha mégsem: Setup Wizard > "Permissions újraigénylése"

### "Az Excel-be kézzel írtam valamit, de az app nem veszi észre"

- A file watcher 60 másodpercenként néz rá a fájlra
- Zárd be az Excel-t (a módosítás csak mentés után látszik)
- Kattints "Frissítés most" gombra → manuális poll
- Ha mégsem: Import-oldalon ("Excel import") kézi újragenerálás

### "Pending badge maradt egy rekordon, nem szinkronizál"

- Status bar → "Sync naplók"
- Nézd meg az utolsó sync hibát
- Gyakori ok: RLS megtagadta a változást (pl. jogosultság megvonva)
- Ha végleg nem szinkronizál: "Mutation eldobás" (adat elvész — vigyázz!)

### "Konfliktus van, de nem akar eltűnni"

- Open/modal a dialogból "Mégsem" gomb csak elhalasztja
- A piros sor marad amíg nem döntesz
- Ha bajban vagy: hívj adminisztrátort, aki a Supabase-ben kézzel fel tudja oldani

### "A Kukából nem tudok visszaállítani"

- Ellenőrizd, nem "vége nagyon régen" (30+ nap) — ha igen, a cron már hard-deletelte
- Ha <30 napos: "Vissza" gomb menedzseri jogosultság szerint ellenőrizve

---

## 12. Technikai építőkövek

(Fejlesztőknek — a későbbi user-guide ezt NEM tartalmazza majd)

### A kulcs fájlok és tárolók

| Típus | Név | Szerep |
|---|---|---|
| **Lib / core** | `lib/offline/db.ts` | Dexie séma (9 modul, mutation queue, conflicts) |
| | `lib/offline/sync-orchestrator.ts` | Pull/push koordinátor, timer-ek, event bus |
| | `lib/offline/mutation-queue.ts` | Write queue, retry backoff, dead letter |
| | `lib/offline/conflict-resolver.ts` | 3-way merge + manual fallback |
| | `lib/offline/delete-policy.ts` | 4 törlés-szcenárió policy |
| **Lib / Excel** | `lib/offline/excel-schema/registry.ts` | Modul → tábla → oszlop séma |
| | `lib/offline/excel-writer.ts` | XLSX.write wrapper |
| | `lib/offline/excel-reader.ts` | Bővített parser (dual header + meta) |
| | `lib/offline/excel-import-diff.ts` | Diff engine |
| | `lib/offline/excel-watcher.ts` | File polling |
| **Lib / FS** | `lib/offline/fs-handle-store.ts` | FileSystemDirectoryHandle perzisztálás |
| **Hooks** | `lib/offline/hooks/use-sync-query.ts` | Stale-while-revalidate read hook |
| | `lib/offline/hooks/use-sync-mutation.ts` | Optimistic write hook |
| **UI** | `components/offline/sync-status-bar.tsx` | Fix-top status strip |
| | `components/offline/conflict-dialog.tsx` | Field-level diff view |
| | `components/offline/setup-wizard.tsx` | Onboarding |
| | `components/shared/recycle-bin-view.tsx` | Kuka reusable |
| **SW** | `app/sw.ts` | Serwist entry, precache, runtime strategies |
| | `public/manifest.json` | PWA install metadata |

### DB sémák

- **Supabase-oldal**: `revision bigint default 0` + `updated_at timestamptz` minden táblán (+ trigger)
- **Supabase új**: `mm_bookmarks`, `import_logs` (már van E1 óta)
- **Dexie-oldal**: minden modul táblája + `_sync_meta`, `mutation_queue`, `_conflicts`, `fs_handles`

### Fontos flow-k

**Pull delta**:
```
lastPullAt = db._sync_meta[table].lastPullAt
supabase.from(table).select('*').gt('updated_at', lastPullAt)
  .eq('congregation_id', scope)  // RLS érvényes
foreach row: upsert Dexie (by id)
db._sync_meta[table].lastPullAt = new Date()
```

**Push mutation**:
```
for each mutation in queue:
  switch op:
    insert: supabase.insert(payload).returning()
    update: supabase.update(payload).eq('id', rowId).eq('revision', baseRev)
            → ha 0 sor: 409 conflict
    delete: supabase.update({ deleted: true }).eq('id', rowId)
  on success: mark mutation synced, update Dexie with server response
  on 409: mark mutation conflict, show dialog
  on error: backoff retry (1s, 4s, 16s, 1min, 5min, max 30min)
```

**Excel flush (debounced)**:
```
on dexie change (any table):
  db._sync_meta.dirty_modules.add(moduleOfTable)
  debounce(30s, flushDirtyModules)

flushDirtyModules():
  for each module in dirty_modules:
    handle = fsHandleStore.get(moduleExcelPath)
    rows = db[module].toArray()
    workbook = buildWorkbook(moduleSchema, rows, _meta)
    xlsx.write(workbook) → tempFile
    tempFile.move(realFile) (atomic)
    rotate backup (.bak.1, .bak.2, .bak.3)
```

**Excel watcher poll**:
```
every 60s if tab visible:
  for each module file:
    stat = handle.getFile()
    if stat.lastModified > _sync_meta[module].lastExcelMtime:
      scheduleImport(module)

scheduleImport(module):
  parsed = xlsx.read(file)
  diff = compareRows(parsed, db[module])
  → review UI
```

---

## 📅 Fázisok és státusz

| Fázis | Időtartam | Státusz | Dokumentáció |
|---|---|---|---|
| **0. Alapozás** | 1 hét | ✅ KÉSZ (2026-04-15) | Projekt log 038 |
| **1. Offline read** | 2 hét | ✅ KÉSZ (2026-04-15) | Projekt log 039 |
| **2. Offline write** | 2 hét | ✅ KÉSZ (2026-04-15) | Projekt log 040 |
| **3. Excel export** | 1 hét | ✅ KÉSZ (2026-04-15) | Projekt log 041 |
| **4. Excel import** | 2 hét | ✅ KÉSZ (2026-04-15) | Projekt log 042 |
| **5a. Sirhely + jegyzőkönyvek modul** | 1.5 hét | ✅ KÉSZ (2026-04-15) | Projekt log 043 |
| **5b. Kuka** | 1 hét | ✅ KÉSZ (2026-04-15) | Projekt log 043 |
| **5c. MM bookmark** | 4 nap | ✅ KÉSZ (2026-04-15) | Projekt log 043 |
| **6. Polish** (opcionális) | 1 hét | ✅ KÉSZ (2026-04-15) | Projekt log 044 |

**Összesen**: 10-12 hét

### Fázis 0 — Kész állapot (2026-04-15)

**Új fájlok**:
- `migration-docs/sql/2026-04-15-sync-tracking.sql` (~310 sor) — 30+ táblára `revision` + `updated_at` + BEFORE UPDATE trigger
- `public/manifest.json` — PWA install metadata (name, icons, shortcuts, theme)
- `app/sw.ts` — Serwist service worker entry
- `lib/offline/db.ts` (~400 sor) — Dexie KartotekaDB class, 18 tábla séma, 4 meta tábla
- `lib/offline/sync-orchestrator.ts` (~280 sor) — SyncOrchestrator singleton skeleton

**Módosítások**:
- `app/layout.tsx` — manifest + viewport (theme color, A2HS prompt-képesség)
- `next.config.ts` — `withSerwistInit` wrapper (swSrc/swDest/disable env)
- `package.json` — +3 dependency: `dexie`, `@serwist/next`, `serwist`

**Felhasználói teendő a Fázis 1 indítása előtt**:
1. SQL migráció futtatása: `migration-docs/sql/2026-04-15-sync-tracking.sql`
2. `npm run build` → ellenőrzés, hogy a service worker sikeresen generálódik (`public/sw.js`)
3. PWA telepítési teszt: Chrome → Beállítás → Alkalmazás telepítése

### Fázis 4 — Kész állapot (2026-04-15)

**Cél**: A lelkész kézzel módosíthatja az Excel fájlokat, és a rendszer felismeri a változásokat, áttekintésre ad lehetőséget, majd a jóváhagyott változásokat visszaírja a Supabase-re a mutation_queue-n keresztül.

**Új fájlok**:
- `lib/offline/excel-reader.ts` (~300 sor) — Excel .xlsx parsoló a séma-registry alapján (típus-konverzió: dátum, bool „Igen"/„Nem", számok HU-decimal commával)
- `lib/offline/excel-import-diff.ts` (~330 sor) — sorról-sorra diff-engine: 'added' / 'updated' / 'deleted' / 'unchanged' + konfliktus-detektálás revision alapján + ember-olvasható display labelek per-tábla
- `lib/offline/excel-watcher.ts` (~220 sor) — singleton watcher, 60s polling (csak `visibilityState === 'visible'`), GRACE_PERIOD_MS = 5s saját write ignorálás, event emit subscribe pattern
- `components/offline/excel-import-review.tsx` (~720 sor) — Review UI: per-modul / per-sheet accordion, Új/Módosítás/Törlés szekciók, per-sor checkbox (konfliktus alapból NEM checked), field-diff részletek expand-olható táblán, bulk „összes kijelölése / egyik sem"
- `components/offline/excel-import-review-client.tsx` (~30 sor) — SSR-safe dynamic wrapper (ssr:false, File System Access API browser-only)
- `components/offline/excel-import-link-card.tsx` (~70 sor) — belépő kártya az /offline oldalon, watch count jelző
- `app/(dashboard)/offline/import/page.tsx` (~50 sor) — server route + slugify + ModuleHero

**Módosítások**:
- `lib/offline/excel-writer.ts` — HIDDEN_META_FIELDS konstans (_rowId/_revision/_syncStatus rejtett oszlopok), `getExcelWatcher().markOwnWrite(schema.module)` hívás a sikeres write után
- `components/offline/sync-provider.tsx` — Excel watcher indítás + event subscribe → 2s debounce-olt toast („Excel változás észlelve — Áttekintés" gombbal, ami `/offline/import`-ra visz)
- `app/(dashboard)/layout.tsx` — `congregationName` prop átadás SyncProvider-nek (watcher slugify-hoz kell)
- `app/(dashboard)/offline/page.tsx` — új ExcelImportLinkCard + Fázis 4 pill a hero-ban

**Apply flow (P4.6) részletek**:
- Új sor (`added`): Dexie `add()` optimistic + `enqueue({ op: 'insert', baseRevision: null })`
- Módosítás (`updated`): Dexie `update()` a merge-elt mezőkkel + `enqueue({ op: 'update', baseRevision: dexie.revision })` — ha a revision Excel-ben eltér Dexie-től, konfliktus van (már az UI-n jelezzük amber jelzéssel, alapból NEM checked)
- Törlés (`deleted`): Dexie `update({ _pendingDelete: true, _syncStatus: 'deleting' })` + `enqueue({ op: 'delete' })` — ALAPBÓL NEM checked (a user kifejezett kijelöléssel fogadja el az Excel-oldali törlést)

**Notification flow (P4.7)**:
- Excel watcher a `_sync_meta` táblába írja `excel_watch_${module}` kulccsal a látott mtime-t
- Első változáskor event emit → SyncProvider debounce (2s) → sonner toast „Excel változás észlelve" + Action gomb → navigál `/offline/import`-ra
- Grace period: 5s a saját write után nem triggereljük magunkat (markOwnWrite)

**Megmaradó teendők Fázis 5 előtt**:
1. **E2E teszt manuális**: [ ] export → Excelben módosít → app észleli (60s-en belül) → review UI → apply → Supabase módosul
2. **E2E teszt konfliktus**: [ ] 2 tab → tab1 offline edit, tab2 server edit → Excel-ben is edit → review UI → konfliktus jelző → egyiket elfogadja
3. **E2E teszt Excel delete**: [ ] user sort töröl Excel-ben → review-ban deleted szekció → alapból NEM checked → user kattint checkbox-ot → apply → Supabase soft-delete
4. **E2E teszt schema version mismatch**: [ ] régebbi verziójú .xlsx beolvasása → warning megjelenik, import nem blokkolt

---

## 🎯 Sikerkritériumok (MVP)

A PWA akkor **MVP-szint**, ha:

1. ✅ A 8 modul offline olvasható (Dexie cache hit)
2. ✅ A 8 modul CRUD offline működik (mutation queue + sync)
3. ✅ Excel fájlok auto-létrejönnek a mappában
4. ✅ Excel-ben módosításokat a rendszer észleli (warning + review)
5. ✅ Kuka 30 napos retention működik
6. ✅ MM bookmark: saját + bookmarked offline, fórum online
7. ✅ Konfliktus dialog a 2 tabos teszten megjelenik
8. ✅ Playwright E2E offline tesztek zöld
9. ✅ Teljesítmény: lista betöltés <100ms, sync <500ms, Excel flush <5s

---

**Dokumentum státusza**: ÉLŐ — minden fázis végén bővítendő az aktuális változásokkal, tesztelési tapasztalatokkal, felhasználói visszajelzéssel.
**Ez a dokumentum lesz a felhasználói útmutató alapja** — a 11. fejezet (hibaelhárítás) különösen értékes user-facing formátumban.
