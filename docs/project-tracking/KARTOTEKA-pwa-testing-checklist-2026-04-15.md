# KARTOTEKA PWA — Manuális tesztelési útmutató

**Dokumentum dátuma**: 2026-04-15
**Scope**: Fázis 0-6 teljes offline-first PWA + összes modul séma-auditja

A rendszer **production-ready MVP állapotban** van. Ez a dokumentum végigvezet a teljes tesztelési forgatókönyvön, hogy minden lépést sajat szemmel végig tudj játszani.

---

## 📋 Tesztelési előkészületek

### 0.1 Supabase SQL migrációk lefuttatása

A valódi KARTOTEKA Supabase SQL Editorban (URL: `https://bjytiawckbibqmtlezfl.supabase.co`) futtatandó migrációk **sorrendben**:

| # | Migráció | Leírás | Kötelező? |
|---|---|---|---|
| 1 | `migration-docs/sql/2026-04-15-sync-tracking.sql` | `revision` + `updated_at` + trigger 30+ táblára | ✅ IGEN |
| 2 | `migration-docs/sql/2026-04-15-recycle-bin-cleanup.sql` | Kuka pg_cron + `purge_recycle_bin()` heti takarítás | ✅ IGEN |
| 3 | `migration-docs/sql/2026-04-15-mm-bookmarks.sql` | MM bookmark tábla (defenzív, csendben kihagyja magát) | Opcionális (MM még nincs) |
| 4 | `migration-docs/sql/2026-04-15-sirhely-fk-relax.sql` | `befizetesid`/`temetesid`/`ferfi` NULL lazítás | ✅ IGEN |

**Ellenőrzés a migrációk után** (SQL Editorban):

```sql
-- 26 tábla sync-tracking oszlopainak ellenőrzése
WITH expected AS (
  SELECT unnest(ARRAY[
    'bankszamlak','befizetes','belsomozgas','berleti_szerzodes','csalad','felmentes','gyerek',
    'hazassag','iktato','iktato_sablonok','jegyzokonyv_hatarozatok','jegyzokonyv_napirendi_pontok',
    'jegyzokonyv_resztvevok','keresztseg','kiadas','konfirmalas','leltar_tetelek','munkanaplo',
    'presbiter','presbiteri_jegyzokonyvek','sirhely','sirhelyberles','sirhelyelhunyt',
    'sirhelytemeto','szemely','temetes'
  ]) AS table_name
)
SELECT e.table_name,
  EXISTS(SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name = e.table_name AND c.column_name = 'revision') AS has_revision,
  EXISTS(SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name = e.table_name AND c.column_name = 'updated_at') AS has_updated_at
FROM expected e
ORDER BY e.table_name;
```

Mind a 26 sor `has_revision = true` ÉS `has_updated_at = true` kell legyen.

### 0.2 Build + futtatás

```powershell
cd "D:\Egyházi APP\KARTOTEKA"
npm run build
# Ha sikeres:
npm start
```

Böngésző: `http://localhost:3000` → bejelentkezés lelkészi fiókkal.

---

## 🧪 Fázis 1 — Offline olvasás (cache hit)

### 1.1 Kezdeti pull

- [ ] Bejelentkezés után nyisd meg a Chrome DevTools-t (F12) → **Application** tab → **IndexedDB** → `kartoteka_offline`
- [ ] Látható kell, hogy legyen 26 adat tábla + 4 meta tábla (`_sync_meta`, `_mutation_queue`, `_conflicts`, `_fs_handles`)
- [ ] 30-60 másodperc után minden táblában legyenek sorok (a szinkron a háttérben futott)

### 1.2 Offline olvasás teszt

- [ ] DevTools → **Network** tab → **Offline** checkbox bekapcsolása
- [ ] Nyisd meg: `/tagnyilvantartas`, `/penzugy`, `/anyakonyv`, `/munkanaplo`, `/iktato`, `/leltar`, `/sirhelyek`, `/jegyzokonyvek`
- [ ] **Minden oldal betöltődik** offline is — a listák láthatók
- [ ] A status-bar a fejlécnél szürkére vált: „Offline mód — X változtatás várakozik"

### 1.3 Visszakapcsolás

- [ ] DevTools → Network → Offline **kikapcsolása**
- [ ] A status-bar zöldre vált: „Szinkronizálva"

---

## 🧪 Fázis 2 — Offline írás + konfliktus

### 2.1 Optimistic offline CRUD

- [ ] Kapcsold ki a hálózatot (Network → Offline)
- [ ] Hozz létre egy új személyt (Tagnyilvántartás → + Új személy)
- [ ] Az új személy **azonnal megjelenik** a listán (optimistic)
- [ ] A sor mellett egy sárga „pending" badge van
- [ ] Status-bar: „1 változtatás várakozik"

### 2.2 Szinkron

- [ ] Kapcsold vissza a hálózatot (Offline off)
- [ ] A sárga badge eltűnik max 5 másodpercen belül → szerver-szinkronizált
- [ ] A Supabase-ben ellenőrizheted az SQL editorral: `SELECT * FROM szemely WHERE congregation_id = '<scope>' ORDER BY id DESC LIMIT 1;`

### 2.3 Konfliktus szimuláció (2 tab)

- [ ] Nyiss egy 2. tab-ot, jelentkezz be ugyanazzal a fiókkal
- [ ] Mindkét tabon szerkeszd UGYANAZT a személyt, egyszerre
- [ ] Mentsd el az elsőn (sikerül) → pull-kor a 2. tab revision-je elavul
- [ ] Mentsd el a 2.-at → megjelenik a **Konfliktus dialog** 3 gombbal:
  - `Saját változat megtartása`
  - `Szerver verzió elfogadása`
  - `Manuális merge` (field-szintű szerkesztés)
- [ ] Teszteld mindhárom opciót egymás után

---

## 🧪 Fázis 3 — Excel export

### 3.1 Mappa kiválasztása

- [ ] Menj a `/offline` oldalra (profil ikon → Offline mentés)
- [ ] „Teljes biztonsági mentés" szekcióban: „Mappa kiválasztása" gomb
- [ ] Natív picker → válassz egy mappát (NEM felhő-szinkronizált — OneDrive/Dropbox figyelmeztetést kapsz)
- [ ] Javasolt: `C:\Users\<név>\Documents\KARTOTEKA-export`

### 3.2 Excel export

- [ ] „Excel export most" gomb
- [ ] 2-5 másodperc
- [ ] File Explorer: a kiválasztott mappában `KARTOTEKA/<gyülekezet-slug>/` → **8 xlsx fájl**:
  - `tagnyilvantartas.xlsx` (5 munkalap)
  - `penzugy.xlsx` (5 munkalap)
  - `anyakonyv.xlsx` (4 munkalap)
  - `munkanaplo.xlsx` (1 munkalap)
  - `iktato.xlsx` (2 munkalap)
  - `leltar.xlsx` (1 munkalap)
  - `sirhelyek.xlsx` (4 munkalap)
  - `jegyzokonyvek.xlsx` (4 munkalap)
- [ ] Nyisd meg egyiket Excelben — **sheet protection** miatt a cellák read-only, de szűrhetők/rendezhetők

---

## 🧪 Fázis 4 — Excel import review (kétirányú sync)

### 4.1 Manuális szerkesztés

- [ ] Nyisd meg a `sirhelyek.xlsx`-et **Excel-ben** (ha sheet protection van: Véleményezés → Lapvédelem feloldása, jelszó üres)
- [ ] A „Sírhelyek" munkalapon módosíts egy sort: `allapot` → `foglalt`
- [ ] Ments (Ctrl+S)
- [ ] **60 másodpercen belül**: toast jelenik meg fent: „Excel változás észlelve — Áttekintés"

### 4.2 Review + apply

- [ ] Kattints a toast „Áttekintés" gombjára → navigál `/offline/import`-ra
- [ ] A sirhely modul accordion ki van nyitva, „Módosítások" szekcióban 1 sor
- [ ] A sor field-diff táblájában látszik a régi `allapot` → új `allapot`
- [ ] Checkbox-szal kijelölöd, „X változás alkalmazása" gomb → confirm → sikeres toast

### 4.3 Törlés Excel-ben (KRITIKUS TESZT)

- [ ] Excelben **töröld ki** egy sírhely sorát (egész sor kijelölés → Delete)
- [ ] Ments
- [ ] Várj 60s-ot → toast
- [ ] `/offline/import` oldalon: „Törlések" szekcióban a sor
- [ ] **FONTOS**: a checkbox alapból **NINCS bepipálva** — explicit kell jelölnöd hogy biztos törölni akarod
- [ ] Pipáld be + apply → a Supabase-ben soft-delete

### 4.4 Manuális fájlfeltöltés (gyors verzió)

- [ ] `/offline/import` oldalon: „Egy fájl feltöltése" gomb
- [ ] Válassz egy `.xlsx`-et → **azonnal** megjelenik a diff (nem vár a 60s polling-ra)

---

## 🧪 Fázis 5a — Új modulok (sirhely + jegyzőkönyvek)

### 5a.1 Sírhely modul — javított mezőnevek

- [ ] `/sirhelyek` oldal betöltődik
- [ ] „+ Temető" dialog: `Név *` és **`Cím`** mezők (nem „Helyszín"!)
- [ ] „+ Sírhely" dialog: `Parcella *`, **`Sor * (number!)`**, **`Szám *`** mezők (nem „Hely")
- [ ] „+ Bérlet" dialog: `Bérlő neve`, **`Megváltás *`** (nem „Kezdet"), **`Lejárata`** (nem „Vég")
- [ ] „+ Elhunyt" dialog: `Név`, `Született`, **`Halál dátuma`** (nem „Elhunyt"), **`Temetés dátuma`** (nem „Temetés")

### 5a.2 Jegyzőkönyvek modul

- [ ] `/jegyzokonyvek` betöltődik, új jegyzőkönyv létrehozása működik

---

## 🧪 Fázis 5b — Kuka (Recycle Bin)

- [ ] Tagnyilvántartásban törölj egy személyt → soft-delete
- [ ] Profil → **Kuka** menüpont (új!)
- [ ] `/kuka` oldal: a törölt személy megjelenik
- [ ] A sor mellett: „X nap múlva törlődik véglegesen"
- [ ] „Visszaállítás" gomb → a személy visszakerül a listába
- [ ] Alternatíva: „Végleges törlés" gomb → megerősítés → eltűnik
- [ ] „Teljes kuka ürítése" és „30+ napos sorok ürítése" bulk gombok

---

## 🧪 Fázis 6 — Polish

### 6.1 Teljes ZIP backup

- [ ] `/offline` oldalon a „Teljes biztonsági mentés" lila kártya
- [ ] „Teljes backup letöltése (.zip)" gomb → confirm → letöltés
- [ ] A letöltött ZIP tartalma:
  - `META.json` — gyülekezet info + statisztika
  - `snapshot.json` — teljes Dexie dump (összes aktív sor)
  - `README.txt` — magyarázat + GDPR figyelmeztetés

### 6.2 Anyakönyv modul — javított marriage mező

- [ ] `/anyakonyv` → `+ Házasság` gomb
- [ ] A dialog mezője: **`Házassági levél *`** (nem „Okirat"!)
- [ ] Teszt: hozz létre egy házasság rekordot és mentsd

### 6.3 Munkanapló modul — javított mezők

- [ ] `/munkanaplo` → `+ Új bejegyzés` → szolgálat kategória
- [ ] Új mezők: **`Bibliaolvasás`**, **`Alapige`** (nem „Igehely"!), **`Énekek`**, **`Szolgálatvezető`** (szolgalt)
- [ ] Résztvevők: `Férfi`, `Nő`, `Gyermek` mezők mentése — a DB-ben `jelenlet_ferfi/no/gyermek`-ként tárolódik, `jelenlet_osszesen` automatikusan számolódik

### 6.4 Leltár modul

- [ ] `/leltar` → `+ Új tétel`
- [ ] Mentés sikeres (a korábbi `vonalkod` nem létező mezőt a rendszer most kihagyja)

---

## 🧪 Fázis PWA — Service Worker + A2HS

### PWA.1 Telepítés

- [ ] Production build után (`npm run build && npm start`)
- [ ] Chrome Omnibox jobb szélén: telepítés ikon
- [ ] Telepítés → standalone window nyílik
- [ ] Offline mód: a standalone windowban is működik

---

## ✅ Tesztelési eredmény

| Fázis | Funkció | Státusz |
|---|---|---|
| 1 | Offline cache hit | ⬜ |
| 2 | Offline CRUD + queue | ⬜ |
| 2 | Konfliktus dialog | ⬜ |
| 3 | Excel export (8 modul) | ⬜ |
| 4 | Excel watcher + toast | ⬜ |
| 4 | Excel import review | ⬜ |
| 4 | Excel delete (KRITIKUS) | ⬜ |
| 5a | Sirhely új mezők | ⬜ |
| 5a | Jegyzőkönyvek modul | ⬜ |
| 5b | Kuka view | ⬜ |
| 5b | Restore + Végleges törlés | ⬜ |
| 6 | Teljes ZIP backup | ⬜ |
| 6 | Anyakönyv marriage mező | ⬜ |
| 6 | Munkanapló új mezők | ⬜ |
| 6 | Leltár vonalkod nélkül | ⬜ |
| PWA | A2HS telepítés | ⬜ |

---

## 🚨 Ha hibát találsz

1. **Toast / dialog hibaüzenet** — másold be a hibát
2. **Browser Console hibák** — F12 → Console → piros hibák másolása
3. **Network failures** — F12 → Network → pirosak átnézése
4. **Supabase direct query** — az SQL Editor-ban ellenőrizd a tábla tartalmát:
   ```sql
   SELECT * FROM <tábla> WHERE congregation_id = '<te-id>' ORDER BY updated_at DESC LIMIT 5;
   ```

---

**Sikeres végigcsinálás esetén: a KARTOTEKA offline-first PWA készen áll az éles használatra.**
